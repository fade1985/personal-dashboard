// Cartera: posiciones (ISIN + compras) que se valoran con cotizaciones en vivo de /api/quote.
// Las posiciones viajan con el resto de datos; las cotizaciones son caché de este navegador.

import { useEffect, useMemo } from 'react'
import { usePersistentState } from './storage'

export interface Lot {
  id: string
  date?: string // YYYY-MM-DD
  qty: number
  /** Precio por participación, en euros */
  price: number
  /** Comisión de la compra, en euros */
  fee: number
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
}

type QuoteResult = Quote | { error: string }
interface QuoteCache { at: number; data: Record<string, QuoteResult> }

export const isQuote = (q: QuoteResult | undefined): q is Quote => !!q && 'price' in q

export const useHoldings = () => usePersistentState<Holding[]>('fin-holdings', [])
const useQuoteCache = () => usePersistentState<QuoteCache>('quotes', { at: 0, data: {} })

export const quoteKey = (h: Holding) => (h.symbol || h.isin).trim().toUpperCase()

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
  /** Precio medio sin comisiones */
  avg: number
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
  const qty = h.lots.reduce((s, l) => s + l.qty, 0)
  const gross = h.lots.reduce((s, l) => s + l.qty * l.price, 0)
  const fees = h.lots.reduce((s, l) => s + l.fee, 0)
  const cost = gross + fees
  const quote = isQuote(q) ? q : undefined
  const value = quote ? qty * quote.price : null
  const day = quote ? qty * (quote.price - quote.prevClose) : null
  return {
    holding: h, quote, error: q && !isQuote(q) ? q.error : undefined, qty, avg: qty ? gross / qty : 0, fees, cost, value, day,
    dayPct: quote && quote.prevClose ? quote.price / quote.prevClose - 1 : null,
    gain: value != null ? value - cost : null,
    gainPct: value != null && cost ? (value - cost) / cost : null,
  }
}

/** Posiciones valoradas, totales y valor por cuenta (para sumarlo al patrimonio). */
export function usePortfolio() {
  const [holdings, setHoldings] = useHoldings()
  const keys = useMemo(() => [...new Set(holdings.map(quoteKey))], [holdings])
  const cache = useLiveQuotes(keys)
  return useMemo(() => {
    const positions = holdings.map((h) => position(h, cache.data[quoteKey(h)]))
    const byAccount: Record<string, number> = {}
    let value = 0, cost = 0, day = 0, prev = 0, priced = 0
    for (const p of positions) {
      if (p.value == null) {
        // Sin cotización todavía: cuenta a precio de coste para no hundir el patrimonio
        byAccount[p.holding.accountId] = (byAccount[p.holding.accountId] ?? 0) + p.cost
        continue
      }
      priced++
      byAccount[p.holding.accountId] = (byAccount[p.holding.accountId] ?? 0) + p.value
      value += p.value
      cost += p.cost
      day += p.day ?? 0
      prev += p.value - (p.day ?? 0)
    }
    return {
      holdings, setHoldings, positions, byAccount, updatedAt: cache.at,
      totals: priced ? { value, cost, gain: value - cost, gainPct: cost ? (value - cost) / cost : 0, day, dayPct: prev ? day / prev : 0 } : null,
    }
  }, [holdings, setHoldings, cache])
}

/** Candidatos de cotización para un texto (ISIN, nombre o símbolo). */
export async function searchSymbols(text: string): Promise<{ symbol: string; name: string; exchange: string; type: string }[]> {
  const r = await fetch(`/api/quote?search=${encodeURIComponent(text)}`)
  if (!r.ok) throw new Error(`Error ${r.status}`)
  return r.json()
}
