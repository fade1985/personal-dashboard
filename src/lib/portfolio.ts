// Cartera: posiciones (ISIN + compras) que se valoran con cotizaciones en vivo de /api/quote.
// Las posiciones viajan con el resto de datos; las cotizaciones son caché de este navegador.

import { useEffect, useMemo, useState } from 'react'
import { usePersistentState } from './storage'

export interface Lot {
  id: string
  date?: string // YYYY-MM-DD
  qty: number
  /** Precio por participación, en euros */
  price: number
  /** Comisión de la compra, en euros */
  fee: number
  /** Participaciones que salen (qty negativa): venta, o cobro de la comisión de gestión en participaciones (Wise) */
  kind?: 'sell' | 'fee'
}

export interface Holding {
  id: string
  isin: string
  name: string
  accountId: string
  /** Símbolo de Yahoo elegido a mano si el ISIN no se encuentra o cae en un mercado raro */
  symbol?: string
  lots: Lot[]
}

export interface Quote {
  symbol: string
  name: string
  exchange: string
  currency: string
  price: number
  prevClose: number
  native: number
  time: number
  spark: number[]
  /** Fondo: un valor liquidativo al día (la minigráfica es del último mes) */
  daily?: boolean
  /** Lang & Schwarz: compra (el precio que se usa) y venta */
  bid?: number
  ask?: number
}

type QuoteResult = Quote | { error: string }
interface QuoteCache { at: number; data: Record<string, QuoteResult> }

export const isQuote = (q: QuoteResult | undefined): q is Quote => !!q && 'price' in q

export const useHoldings = () => usePersistentState<Holding[]>('fin-holdings', [])
const useQuoteCache = () => usePersistentState<QuoteCache>('quotes', { at: 0, data: {} })

/** Clave para pedir la cotización. Con ISIN americano, un ticker de EE. UU. puesto a mano (NVDA, GOOG, BRK-B) se ignora:
 *  así sale de Lang & Schwarz con el precio de compra, como en Trade Republic (y Nasdaq si no está en L&S). */
export const quoteKey = (h: Holding) => {
  const isin = h.isin.trim().toUpperCase()
  const symbol = (h.symbol ?? '').trim().toUpperCase()
  if (/^US[A-Z0-9]{9}\d$/.test(isin) && /^[A-Z]{1,5}(-[A-Z])?$/.test(symbol)) return isin
  return symbol || isin
}

const REFRESH = 60e3
let inflight: Promise<void> | null = null

/** Pide las cotizaciones que falten o tengan más de un minuto; una sola petición aunque haya varios componentes. */
function useLiveQuotes(keys: string[]) {
  const [cache, setCache] = useQuoteCache()
  const sig = [...keys].sort().join(',')

  useEffect(() => {
    if (!sig) return
    const want = sig.split(',')
    const tick = (force = false) => {
      if (inflight || document.hidden) return
      const stale = Date.now() - cache.at > REFRESH - 5e3
      const missing = want.some((k) => !(k in cache.data))
      if (!force && !stale && !missing) return
      inflight = fetch(`/api/quote?${want.map((k) => `q=${encodeURIComponent(k)}`).join('&')}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((data: Record<string, QuoteResult>) => {
          // Si falla una, conservamos la última buena
          setCache((c) => {
            const merged = { ...c.data }
            for (const [k, v] of Object.entries(data)) if (isQuote(v) || !isQuote(merged[k])) merged[k] = v
            return { at: Date.now(), data: merged }
          })
        })
        .catch((e) => console.warn('Cotizaciones:', e))
        .finally(() => { inflight = null })
    }
    tick()
    const id = setInterval(tick, REFRESH)
    const onVis = () => !document.hidden && tick()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [sig, cache.at, cache.data, setCache])

  return cache
}

export interface Position {
  holding: Holding
  quote?: Quote
  error?: string
  qty: number
  /** Precio medio con comisiones (como lo muestra Trade Republic) */
  avg: number
  /** Precio medio sin comisiones */
  avgGross: number
  fees: number
  /** Lo que te costó, comisiones incluidas */
  cost: number
  value: number | null
  day: number | null
  dayPct: number | null
  gain: number | null
  gainPct: number | null
}

export function position(h: Holding, q?: QuoteResult): Position {
  const buys = h.lots.filter((l) => !l.kind)
  const out = h.lots.filter((l) => l.kind)
  const qty = h.lots.reduce((s, l) => s + l.qty, 0)
  const gross = buys.reduce((s, l) => s + l.qty * l.price, 0)
  // Lo que sale (ventas y comisiones cobradas en participaciones) descuenta lo aportado,
  // como hace Wise en su "Rentabilidad total"
  const withdrawn = out.reduce((s, l) => s - l.qty * l.price, 0)
  const fees = buys.reduce((s, l) => s + l.fee, 0) + h.lots.filter((l) => l.kind === 'fee').reduce((s, l) => s - l.qty * l.price, 0)
  const cost = gross + buys.reduce((s, l) => s + l.fee, 0) - withdrawn
  const quote = isQuote(q) ? q : undefined
  const value = quote ? qty * quote.price : null
  const day = quote ? qty * (quote.price - quote.prevClose) : null
  return {
    holding: h, quote, error: q && !isQuote(q) ? q.error : undefined, qty, avg: qty ? cost / qty : 0, avgGross: qty ? (gross - withdrawn) / qty : 0, fees, cost, value, day,
    dayPct: quote && quote.prevClose ? quote.price / quote.prevClose - 1 : null,
    gain: value != null ? value - cost : null,
    gainPct: value != null && cost ? (value - cost) / cost : null,
  }
}

/** Totales de un conjunto de posiciones (solo las que ya tienen cotización); null si ninguna la tiene. */
export function summarize(positions: Position[]) {
  let value = 0, cost = 0, day = 0, prev = 0, priced = 0
  for (const p of positions) {
    if (p.value == null) continue
    priced++
    value += p.value
    cost += p.cost
    day += p.day ?? 0
    prev += p.value - (p.day ?? 0)
  }
  return priced ? { value, cost, gain: value - cost, gainPct: cost ? (value - cost) / cost : 0, day, dayPct: prev ? day / prev : 0 } : null
}

/** Posiciones valoradas, totales y valor por cuenta (para sumarlo al patrimonio). */
export function usePortfolio() {
  const [holdings, setHoldings] = useHoldings()
  const keys = useMemo(() => [...new Set(holdings.map(quoteKey))], [holdings])
  const cache = useLiveQuotes(keys)
  return useMemo(() => {
    const positions = holdings.map((h) => position(h, cache.data[quoteKey(h)]))
    const byAccount: Record<string, number> = {}
    // Sin cotización todavía: cuenta a precio de coste para no hundir el patrimonio
    for (const p of positions) byAccount[p.holding.accountId] = (byAccount[p.holding.accountId] ?? 0) + (p.value ?? p.cost)
    return { holdings, setHoldings, positions, byAccount, updatedAt: cache.at, totals: summarize(positions) }
  }, [holdings, setHoldings, cache])
}

/** Candidatos de cotización para un texto (ISIN, nombre o símbolo). */
export async function searchSymbols(text: string): Promise<{ symbol: string; name: string; exchange: string; type: string }[]> {
  const r = await fetch(`/api/quote?search=${encodeURIComponent(text)}`)
  if (!r.ok) throw new Error(`Error ${r.status}`)
  return r.json()
}

/** [hora en ms, precio en euros] */
export type Point = [number, number]
export interface History { intraday: Point[]; daily: Point[] }

const HISTORY_TTL = 60e3
const histories = new Map<string, { at: number; p: Promise<History> }>()

/** Histórico de una cotización para la ficha (en memoria un minuto; se vuelve a pedir cada minuto mientras está abierta). */
export function useHistory(key: string) {
  const [state, setState] = useState<{ key: string; data?: History; error?: string }>({ key })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => !document.hidden && setTick((n) => n + 1), HISTORY_TTL)
    return () => clearInterval(id)
  }, [key])
  useEffect(() => {
    let alive = true
    let hit = histories.get(key)
    if (!hit || Date.now() - hit.at > HISTORY_TTL - 5e3) {
      hit = {
        at: Date.now(),
        p: fetch(`/api/quote?history=${encodeURIComponent(key)}`).then(async (r) => {
          const j = await r.json()
          if (!r.ok || j.error) throw new Error(j.error ?? String(r.status))
          return j as History
        }),
      }
      hit.p.catch(() => histories.delete(key))
      histories.set(key, hit)
    }
    // Si falla una actualización, se queda la gráfica que ya había
    hit.p.then((data) => alive && setState({ key, data }), (e: Error) => alive && setState((s) => (s.key === key && s.data ? s : { key, error: e.message })))
    return () => { alive = false }
  }, [key, tick])
  return state.key === key ? state : { key }
}

// ---------- Extracto de Wise ----------

/** Fila de CSV con comillas (los extractos de Wise las usan en descripciones e ids). */
function csvRow(line: string) {
  const out: string[] = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++ } else quoted = !quoted
    } else if (ch === ',' && !quoted) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out
}

/**
 * Compras y salidas de participaciones de un extracto CSV de Wise (cuenta con Acciones/Intereses):
 * cada recarga compra participaciones y cada mes la comisión de Wise Assets Europe vende unas pocas.
 * Devuelve las compras agrupadas por ISIN; el id de cada compra es el de Wise, así reimportar no duplica.
 */
export function parseWiseStatement(text: string): Map<string, Lot[]> {
  const [head, ...rows] = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  const cols = csvRow(head)
  const col = (name: string) => cols.indexOf(name)
  const c = {
    id: col('TransferWise ID'), date: col('Date'), type: col('Transaction Details Type'), side: col('Trade Side-0'),
    idType: col('Traded Asset Id Type-0'), isin: col('Traded Asset Id Value-0'), units: col('Traded Units-0'),
    price: col('Asset Base Currency Unit Price Amount-0'), currency: col('Asset Base Currency Unit Price Currency-0'),
  }
  if ([c.side, c.isin, c.units, c.price].some((i) => i < 0)) throw new Error('No parece un extracto de Wise con inversiones (faltan las columnas de participaciones)')
  const lots = new Map<string, Lot[]>()
  for (const line of rows) {
    const r = csvRow(line)
    const units = Number(r[c.units])
    const price = Number(r[c.price])
    if (r[c.idType] !== 'ISIN' || !r[c.isin] || !units || !price) continue
    if (c.currency >= 0 && r[c.currency] && r[c.currency] !== 'EUR') continue
    const [d, m, y] = r[c.date].split('-')
    const sell = r[c.side] === 'SELL'
    const lot: Lot = {
      id: `wise-${r[c.id]}`, date: `${y}-${m}-${d}`, qty: sell ? -units : units, price, fee: 0,
      ...(sell ? { kind: r[c.type] === 'ACCRUAL_CHARGE' ? 'fee' as const : 'sell' as const } : {}),
    }
    lots.set(r[c.isin], [...(lots.get(r[c.isin]) ?? []), lot])
  }
  return lots
}
