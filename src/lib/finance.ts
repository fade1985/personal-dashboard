// Finanzas: cuentas, movimientos, categorías y reglas. Todo vive en localStorage;
// los movimientos entran importando los CSV/Excel que exporta cada banco.

import { usePersistentState } from './storage'

export type AccountKind = 'bank' | 'card' | 'wallet' | 'invest'

/** Qué columna del archivo del banco es cada dato (por nombre de cabecera). */
export interface ColumnMapping {
  date: string
  desc: string
  amount?: string
  debit?: string
  credit?: string
  balance?: string
  invert?: boolean
}

export interface Account {
  id: string
  name: string
  kind: AccountKind
  color: string
  emoji: string
  /** Saldo (o valor de la inversión) introducido a mano y cuándo. */
  manual?: { value: number; at: string }
  /** Dinero aportado, para calcular la rentabilidad de las inversiones. */
  invested?: number
  /** Valores anotados a lo largo del tiempo (inversiones). */
  history?: { at: string; value: number }[]
  mapping?: ColumnMapping
}

export interface Tx {
  id: string
  accountId: string
  date: string // YYYY-MM-DD
  desc: string
  amount: number
  category: string
  balance?: number
  /** Categoría elegida a mano: las reglas no la tocan. */
  manual?: boolean
}

export interface Rule {
  match: string
  category: string
}

export interface Category {
  id: string
  label: string
  emoji: string
  color: string
  /** No cuenta como gasto ni ingreso (traspasos entre tus cuentas, aportaciones). */
  internal?: boolean
  /** Cuenta como ingreso; el resto de categorías son gasto (y sus devoluciones lo restan). */
  income?: boolean
}

export const CATEGORIES: Category[] = [
  { id: 'super', label: 'Supermercado', emoji: '🛒', color: '#4ade80' },
  { id: 'food', label: 'Restaurantes', emoji: '🍔', color: '#fb923c' },
  { id: 'transport', label: 'Transporte', emoji: '🚇', color: '#38bdf8' },
  { id: 'home', label: 'Hogar', emoji: '🏠', color: '#a78bfa' },
  { id: 'bills', label: 'Suministros', emoji: '💡', color: '#facc15' },
  { id: 'subs', label: 'Suscripciones', emoji: '📺', color: '#f472b6' },
  { id: 'shopping', label: 'Compras', emoji: '🛍️', color: '#fb7185' },
  { id: 'leisure', label: 'Ocio', emoji: '🎮', color: '#c084fc' },
  { id: 'health', label: 'Salud', emoji: '💊', color: '#2dd4bf' },
  { id: 'travel', label: 'Viajes', emoji: '✈️', color: '#60a5fa' },
  { id: 'fees', label: 'Comisiones', emoji: '🧾', color: '#94a3b8' },
  { id: 'cash', label: 'Efectivo', emoji: '🏧', color: '#a3a3a3' },
  { id: 'other', label: 'Otros gastos', emoji: '📦', color: '#64748b' },
  { id: 'salary', label: 'Nómina', emoji: '💼', color: '#22c55e', income: true },
  { id: 'income', label: 'Otros ingresos', emoji: '💰', color: '#86efac', income: true },
  { id: 'transfer', label: 'Traspasos', emoji: '🔁', color: '#818cf8', internal: true },
  { id: 'invest', label: 'Inversión', emoji: '📈', color: '#22d3ee', internal: true },
]
export const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c])) as Record<string, Category>

/** Reglas por defecto: si la descripción contiene el texto, se asigna la categoría. */
const DEFAULT_RULES: Rule[] = [
  // Primero lo más específico: pagar la tarjeta Carrefour no es ir al súper
  ...['trade republic', 'wise', 'indexa', 'myinvestor', 'degiro'].map((m) => ({ match: m, category: 'invest' })),
  ...['traspaso', 'pago tarjeta', 'liquidacion tarjeta', 'carrefour pass', 'servicios financieros carrefour', 'paypal'].map((m) => ({ match: m, category: 'transfer' })),
  ...['mercadona', 'carrefour', 'lidl', 'aldi', 'alcampo', 'eroski', 'supermercado', 'ahorramas', 'hipercor', 'consum', 'bonarea'].map((m) => ({ match: m, category: 'super' })),
  ...[' dia ', 'supermercados dia'].map((m) => ({ match: m, category: 'super' })),
  ...['glovo', 'just eat', 'uber eats', 'restaurante', 'telepizza', 'burger', 'mcdonald', 'kfc', 'starbucks', 'cafeteria', 'taberna', 'vips', 'goiko'].map((m) => ({ match: m, category: 'food' })),
  ...['renfe', 'metro de madrid', ' emt ', 'cabify', 'uber', 'bolt', 'repsol', 'cepsa', 'galp', 'gasolinera', 'parking', 'blablacar', 'consorcio transportes', 'ouigo', 'iryo'].map((m) => ({ match: m, category: 'transport' })),
  ...['netflix', 'spotify', 'disney', 'hbo', 'max.com', 'prime video', 'apple.com', 'google one', 'youtube', 'nintendo', 'playstation', 'xbox', 'dazn', 'chatgpt', 'openai', 'anthropic', 'claude'].map((m) => ({ match: m, category: 'subs' })),
  ...['iberdrola', 'endesa', 'naturgy', 'holaluz', 'totalenergies', 'vodafone', 'movistar', 'orange', ' digi ', 'masmovil', 'pepephone', 'jazztel', 'canal de isabel', 'aguas'].map((m) => ({ match: m, category: 'bills' })),
  ...['amazon', 'aliexpress', 'el corte ingles', 'zara', 'primark', 'decathlon', 'ikea', 'mediamarkt', 'fnac', 'pccomponentes', 'shein', 'game stop', 'game.es'].map((m) => ({ match: m, category: 'shopping' })),
  ...['farmacia', 'clinica', 'dentista', 'sanitas', 'adeslas', 'hospital', 'optica'].map((m) => ({ match: m, category: 'health' })),
  ...[' cine ', 'yelmo', 'cinesa', 'ticketmaster', 'entradas', 'steam', 'gimnasio', 'basic-fit', 'dreamfit'].map((m) => ({ match: m, category: 'leisure' })),
  ...['ryanair', 'iberia', 'vueling', 'booking', 'airbnb', 'hotel', 'easyjet'].map((m) => ({ match: m, category: 'travel' })),
  ...['comision', 'comisión', 'intereses deudores', 'cuota tarjeta'].map((m) => ({ match: m, category: 'fees' })),
  ...['cajero', 'reintegro', 'disposicion efectivo'].map((m) => ({ match: m, category: 'cash' })),
  ...['nomina', 'nómina', 'salario'].map((m) => ({ match: m, category: 'salary' })),

]

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'santander', name: 'Santander', kind: 'bank', color: '#ec0000', emoji: '🏦' },
  { id: 'caixabank', name: 'CaixaBank', kind: 'bank', color: '#0b8fd6', emoji: '⭐' },
  { id: 'carrefour', name: 'Carrefour Pass', kind: 'card', color: '#2563eb', emoji: '💳' },
  { id: 'paypal', name: 'PayPal', kind: 'wallet', color: '#38bdf8', emoji: '🅿️' },
  { id: 'wise', name: 'Wise', kind: 'invest', color: '#9fe870', emoji: '🌍' },
  { id: 'traderepublic', name: 'Trade Republic', kind: 'invest', color: '#e5e7eb', emoji: '📊' },
]

export const KIND_LABEL: Record<AccountKind, string> = {
  bank: 'Cuenta', card: 'Tarjeta de crédito', wallet: 'Monedero', invest: 'Inversión',
}

export const useAccounts = () => usePersistentState<Account[]>('fin-accounts', DEFAULT_ACCOUNTS)
export const useTxs = () => usePersistentState<Tx[]>('fin-txs', [])
export const useRules = () => usePersistentState<Rule[]>('fin-rules', [])
export const usePrivacy = () => usePersistentState<boolean>('fin-hide', false)

export const norm = (s: string) =>
  ` ${s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')} `

/** Un texto con espacios al principio o al final solo encaja como palabra completa. */
const matches = (desc: string, pattern: string) => {
  const p = norm(pattern)
  return desc.includes(/^\s|\s$/.test(pattern) ? p : p.trim())
}

/** Las reglas del usuario mandan sobre las de serie; si nada encaja, según el signo. */
export function categorize(desc: string, amount: number, rules: Rule[]) {
  const d = norm(desc)
  const hit = [...rules, ...DEFAULT_RULES].find((r) => r.match.trim() && matches(d, r.match))
  return hit ? hit.category : amount >= 0 ? 'income' : 'other'
}

/** Saldo actual: el manual si es más reciente que el último saldo importado. */
export function accountBalance(a: Account, txs: Tx[]): { value: number; at: string } | null {
  const own = txs.filter((t) => t.accountId === a.id)
  const withBal = own.filter((t) => t.balance != null).sort((x, y) => y.date.localeCompare(x.date))
  const fromTx = withBal[0] ? { value: withBal[0].balance!, at: withBal[0].date } : null
  if (a.manual && (!fromTx || a.manual.at >= fromTx.at)) {
    // Movimientos posteriores al saldo manual (en cuentas sin columna de saldo)
    const after = own.filter((t) => t.balance == null && t.date > a.manual!.at).reduce((s, t) => s + t.amount, 0)
    return { value: a.manual.value + after, at: a.manual.at }
  }
  if (fromTx) return fromTx
  if (a.kind === 'card' && own.length) return { value: own.reduce((s, t) => s + t.amount, 0), at: own.map((t) => t.date).sort().at(-1)! }
  return null
}

export const eur = (v: number, decimals = 2) =>
  v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: decimals, maximumFractionDigits: decimals })

export const monthKey = (d: string | Date) => (typeof d === 'string' ? d.slice(0, 7) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)

/** Claves "aaaa-mm" de los últimos n meses, terminando en `end`. */
export function lastMonths(n: number, end: string = monthKey(new Date())) {
  const [y, m] = end.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => monthKey(new Date(y, m - 1 - (n - 1 - i), 1)))
}

export function monthFlow(txs: Tx[], key: string) {
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (!t.date.startsWith(key)) continue
    const c = CAT[t.category]
    if (c?.internal) continue
    if (c?.income) income += t.amount
    else expense -= t.amount
  }
  return { key, income, expense, saved: income - expense }
}

export function spendByCategory(txs: Tx[], key: string) {
  const by = new Map<string, number>()
  for (const t of txs) {
    const c = CAT[t.category]
    if (!t.date.startsWith(key) || c?.internal || c?.income) continue
    by.set(t.category, (by.get(t.category) ?? 0) - t.amount)
  }
  return [...by.entries()].filter(([, v]) => v > 0.005).map(([id, value]) => ({ cat: CAT[id] ?? CAT.other, value })).sort((a, b) => b.value - a.value)
}

export function netWorth(accounts: Account[], txs: Tx[]) {
  const balances = Object.fromEntries(accounts.map((a) => [a.id, accountBalance(a, txs)]))
  let liquid = 0, invest = 0, debt = 0
  for (const a of accounts) {
    const v = balances[a.id]?.value ?? 0
    if (a.kind === 'invest') invest += v
    else if (a.kind === 'card') debt += v
    else liquid += v
  }
  return { balances, liquid, invest, debt, total: liquid + invest + debt }
}

/** Texto corto para crear una regla a partir de un concepto ("COMPRA TARJ. MERCADONA 1234" → "mercadona"). */
export function merchantOf(desc: string) {
  const words = norm(desc)
    .replace(/\b(compra|compras|tarj(eta)?|pago|movil|en|con|transaccion|contactless|recibo|adeudo|cargo|de|del|la|el|sepa|bizum|apple pay|google pay|internet|com)\b\.?/g, ' ')
    .replace(/[^a-z0-9 .&-]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2 && !/\d{3,}/.test(w))
  return words.slice(0, 2).join(' ')
}

// ---------- Importación ----------

export type Cell = string | number | boolean | Date | null | undefined

const HEADER_HINTS = /fecha|date|concepto|descrip|movimiento|detalle|importe|amount|cantidad|saldo|balance|cargo|abono|debe|haber|nombre|neto|bruto/i

/** Busca la fila de cabeceras: la primera con varias celdas que suenan a columnas de banco. */
export function findHeaderRow(rows: Cell[][]) {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const hits = rows[i].filter((c) => typeof c === 'string' && c.length < 40 && HEADER_HINTS.test(c)).length
    if (hits >= 2) return i
  }
  return 0
}

export function headersOf(row: Cell[]) {
  const seen = new Map<string, number>()
  return row.map((c, i) => {
    let h = String(c ?? '').trim() || `Columna ${i + 1}`
    const n = seen.get(h) ?? 0
    seen.set(h, n + 1)
    if (n) h += ` (${n + 1})`
    return h
  })
}

/** Adivina el mapeo a partir de los nombres de las cabeceras. */
export function guessMapping(headers: string[]): ColumnMapping {
  const find = (...res: RegExp[]) => {
    for (const re of res) {
      const h = headers.find((x) => re.test(x))
      if (h) return h
    }
    return undefined
  }
  const amount = find(/^importe$/i, /^neto$/i, /importe|amount|cantidad/i)
  return {
    date: find(/fecha.*operaci/i, /^fecha$/i, /^date$/i, /fecha|date/i) ?? headers[0],
    desc: find(/concepto/i, /descrip/i, /^nombre$/i, /movimiento|detalle|description|comercio/i) ?? headers[1],
    amount,
    debit: amount ? undefined : find(/cargo|debe|gasto/i),
    credit: amount ? undefined : find(/abono|haber|ingreso/i),
    balance: find(/^saldo$/i, /saldo|balance/i),
  }
}

/** "1.234,56 €", "-12,30", "1,234.56", 12.3 → número. */
export function parseAmount(v: Cell): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return v
  let s = String(v).replace(/[€$£\s ]|EUR/gi, '')
  if (!s) return null
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1) }
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.')
  else if (lastDot > lastComma && lastComma >= 0) s = s.replace(/,/g, '')
  else if (lastDot >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '') // "1.234" a la española
  const n = Number(s)
  return Number.isFinite(n) ? (neg ? -n : n) : null
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Date, número de serie de Excel, "dd/mm/aaaa", "aaaa-mm-dd"… → "aaaa-mm-dd". */
export function parseDate(v: Cell): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    // SheetJS crea las fechas en UTC; sumamos medio día para no caer en el día anterior
    const d = new Date(v.getTime() + 12 * 3600_000)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400_000)
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return `${y}-${pad(+m[2])}-${pad(+m[1])}`
  }
  return null
}

export interface ParsedRow {
  date: string
  desc: string
  amount: number
  balance?: number
}

export function applyMapping(headers: string[], rows: Cell[][], map: ColumnMapping): ParsedRow[] {
  const col = (h?: string) => (h ? headers.indexOf(h) : -1)
  const [cd, cs, ca, cdb, ccr, cb] = [col(map.date), col(map.desc), col(map.amount), col(map.debit), col(map.credit), col(map.balance)]
  const out: ParsedRow[] = []
  for (const r of rows) {
    const date = parseDate(r[cd])
    if (!date) continue
    let amount: number | null
    if (ca >= 0) amount = parseAmount(r[ca])
    else {
      const d = cdb >= 0 ? parseAmount(r[cdb]) : null
      const c = ccr >= 0 ? parseAmount(r[ccr]) : null
      amount = d == null && c == null ? null : (c ?? 0) - Math.abs(d ?? 0)
    }
    if (amount == null) continue
    if (map.invert) amount = -amount
    const balance = cb >= 0 ? parseAmount(r[cb]) ?? undefined : undefined
    out.push({ date, desc: String(r[cs] ?? '').replace(/\s+/g, ' ').trim() || '(sin concepto)', amount: Math.round(amount * 100) / 100, balance })
  }
  return out
}

/**
 * Identificador estable de un movimiento para no duplicar al reimportar.
 * Dos movimientos idénticos el mismo día se distinguen por su orden de aparición.
 */
export function txIds(accountId: string, rows: ParsedRow[]) {
  const count = new Map<string, number>()
  return rows.map((r) => {
    const base = `${accountId}|${r.date}|${r.amount.toFixed(2)}|${norm(r.desc).trim()}`
    const n = count.get(base) ?? 0
    count.set(base, n + 1)
    return `${base}|${n}`
  })
}
