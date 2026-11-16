// Avisos de CaixaBank por correo (alerta@caixabank.com) → movimientos y saldos, sin importar el extracto.
//   "Movimientos de tarjetas":            compras con la tarjeta (MyCard, de crédito: se pagan de golpe a fin de mes)
//   "Todos los movimientos de la cuenta": cargos y abonos en la cuenta (el cargo de MYCARD es el pago de la tarjeta)
//   "Saldo a una fecha concreta":         saldo disponible de la cuenta ese día
// Los avisos de PayPal ya no se leen: PayPal paga con la tarjeta Carrefour Pass y esas compras
// llegan con su extracto en PDF ("PAYPAL *COMERCIO").
// Se leen de tu Gmail desde el navegador, con el mismo permiso de lectura que la tarjeta de Correo.

import { useEffect } from 'react'
import { gapi } from './google'
import { readStore, saveStore } from './storage'
import { DEFAULT_ACCOUNTS, categorize, reconcileCards, type Account, type Rule, type Tx } from './finance'
import { parseCaixa, parsePayPal } from './bankMailParse'

export { parseCaixa, parsePayPal }

const CAIXA = 'alerta@caixabank.com'
const SENDERS = [CAIXA]
const INIT_KEY = 'bankmail-init'
const SEEN_KEY = 'bankmail-seen'
export const STATUS_KEY = 'bankmail-status'

export interface BankMailStatus {
  at: number; added: number; balances: number; error?: string
  /** Último aviso de saldo leído, para enseñarlo en la barra */
  lastBalance?: { value: number; date: string; ending: string; account: string }
  /** Avisos de CaixaBank que no se entendieron (asunto y comienzo del texto), para poder ajustarlos */
  unknown?: { subject: string; text: string }[]
}
const RESALDO_KEY = 'bankmail-resaldo'

// ---------- Gmail ----------

interface Part { mimeType: string; body?: { data?: string }; parts?: Part[]; headers?: { name: string; value: string }[] }

function decode(data: string, charset = 'utf-8') {
  const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    return new TextDecoder().decode(bytes)
  }
}

/** Texto del correo: la parte de texto plano o, si solo hay HTML, el HTML sin etiquetas. */
function bodyText(p: Part): string {
  const all: Part[] = []
  const walk = (x: Part) => { all.push(x); x.parts?.forEach(walk) }
  walk(p)
  const charset = (x: Part) => /charset="?([\w-]+)/i.exec(x.headers?.find((h) => /content-type/i.test(h.name))?.value ?? '')?.[1]
  const plain = all.find((x) => x.mimeType === 'text/plain' && x.body?.data)
  const html = all.find((x) => x.mimeType === 'text/html' && x.body?.data)
  const chosen = plain ?? html
  if (!chosen) return ''
  const raw = decode(chosen.body!.data!, charset(chosen))
  if (chosen === plain) return raw
  const doc = new DOMParser().parseFromString(raw.replace(/<br\s*\/?>|<\/(p|div|tr|td|li)>/gi, '$& '), 'text/html')
  return doc.body.textContent ?? ''
}

async function listIds(from: string, days: number, extra = '') {
  const ids: string[] = []
  let page: string | undefined
  do {
    const q = encodeURIComponent(`from:${from} newer_than:${days}d${extra}`)
    const r = await gapi<{ messages?: { id: string }[]; nextPageToken?: string }>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100&q=${q}${page ? `&pageToken=${page}` : ''}`,
    )
    ids.push(...(r.messages ?? []).map((m) => m.id))
    page = r.nextPageToken
  } while (page && ids.length < 1000)
  return ids
}

// ---------- Aplicar a las cuentas ----------

const findBank = (accounts: Account[], ending: string) =>
  accounts.find((a) => a.ending === ending) ?? accounts.find((a) => a.kind === 'bank' && !a.ending && /caixa/i.test(a.name))

const cap = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()).replace(/^Mycard$/, 'MyCard')

/**
 * Lee los avisos nuevos y los añade. Cada correo se procesa una vez; los movimientos llevan id fijo
 * (mail:<correo>:<n>), así que aunque se repita la lectura no se duplican.
 */
export async function syncBankMail(): Promise<BankMailStatus> {
  const seen = new Set(readStore<string[]>(SEEN_KEY, []))
  // Una vez: volver a leer los avisos de saldo ya vistos (solo ponen el saldo, no crean movimientos,
  // así que repetirlos no duplica nada) por si el saldo se perdió en una versión anterior
  if (!readStore<boolean>(RESALDO_KEY, false)) {
    for (const id of await listIds(CAIXA, 90, ' subject:saldo')) seen.delete(id)
    saveStore(RESALDO_KEY, true)
  }
  // La primera vez que se lee un remitente se miran 90 días; luego basta con lo reciente
  const init = new Set(readStore<string[]>(INIT_KEY, seen.size ? [CAIXA] : []))
  const ids = (await Promise.all(SENDERS.map((f) => listIds(f, init.has(f) ? 20 : 90)))).flat().filter((id) => !seen.has(id))

  const mails: { id: string; at: number; text: string; subject: string; from: string }[] = []
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = await Promise.all(ids.slice(i, i + 10).map((id) =>
      gapi<{ id: string; internalDate: string; payload: Part }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`)
        .then((m) => {
          const h = (n: string) => m.payload.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? ''
          return { id: m.id, at: Number(m.internalDate), text: bodyText(m.payload), subject: h('subject'), from: h('from').toLowerCase() }
        })))
    mails.push(...chunk)
  }
  mails.sort((a, b) => a.at - b.at)

  let accounts = readStore<Account[]>('fin-accounts', DEFAULT_ACCOUNTS)
  let txs = readStore<Tx[]>('fin-txs', [])
  const rules = readStore<Rule[]>('fin-rules', [])
  const have = new Set(txs.map((t) => t.id))
  let added = 0, balances = 0
  let lastBalance: BankMailStatus['lastBalance']
  const unknown: { subject: string; text: string }[] = []
  // Lo que cambia esta lectura, para aplicarlo al final sobre lo guardado entonces (mientras se leían
  // los correos puede haber llegado otra versión desde Drive y no hay que pisarla)
  const newAccounts = new Map<string, Account>()
  const patched = new Map<string, Partial<Account>>()
  const newTxs: Tx[] = []

  const patch = (id: string, p: Partial<Account>) => {
    patched.set(id, { ...patched.get(id), ...p })
    accounts = accounts.map((x) => (x.id === id ? { ...x, ...p } : x))
    return accounts.find((x) => x.id === id)!
  }
  const ensureBank = (ending: string) => {
    let a = findBank(accounts, ending)
    if (!a) {
      a = { id: `caixa-${ending}`, name: 'CaixaBank', kind: 'bank', color: '#0b8fd6', emoji: '⭐', domain: 'caixabank.es', ending }
      accounts = [...accounts, a]
      newAccounts.set(a.id, a)
    } else if (a.ending !== ending) {
      a = patch(a.id, { ending })
    }
    return a
  }
  const ensureCard = (ending: string, card = 'Tarjeta') => {
    let a = accounts.find((x) => x.ending === ending)
    if (!a) {
      // Dos tarjetas con el mismo nombre (dos MYCARD): se distinguen por sus últimas cifras
      const name = accounts.some((x) => x.name === `${cap(card)} CaixaBank`) ? `${cap(card)} …${ending}` : `${cap(card)} CaixaBank`
      a = { id: `caixa-card-${ending}`, name, kind: 'card', color: '#0b8fd6', emoji: '💳', domain: 'caixabank.es', ending, product: card }
      accounts = [...accounts, a]
      newAccounts.set(a.id, a)
    } else if (!a.product && card !== 'Tarjeta') {
      a = patch(a.id, { product: card })
    }
    return a
  }
  const push = (t: Tx) => {
    if (have.has(t.id)) return
    have.add(t.id)
    txs = [...txs, t]
    newTxs.push(t)
    added++
  }


  for (const m of mails) {
    const { moves, balances: bals } = parseCaixa(m.text)
    moves.forEach((mv, k) => {
      const id = `mail:${m.id}:${k}`
      if (mv.kind === 'card') {
        const card = ensureCard(mv.ending, mv.card)
        push({ id, accountId: card.id, date: mv.date, desc: mv.desc, amount: mv.amount, category: categorize(mv.desc, mv.amount, rules), source: 'mail' })
        return
      }
      const bank = ensureBank(mv.ending)
      // El cobro de las tarjetas y las compras con débito repetidas los marca reconcileCards al final
      push({ id, accountId: bank.id, date: mv.date, desc: mv.desc, amount: mv.amount, category: categorize(mv.desc, mv.amount, rules), source: 'mail' })
    })
    for (const b of bals) {
      const bank = ensureBank(b.ending)
      if (!bank.manual || bank.manual.at <= b.date) {
        patch(bank.id, { manual: { value: b.value, at: b.date } })
        balances++
      }
      if (!lastBalance || lastBalance.date <= b.date) lastBalance = { value: b.value, date: b.date, ending: b.ending, account: bank.name }
    }
    // Lo que no se entiende no se da por visto: se reintenta con cada mejora de la lectura
    if (!moves.length && !bals.length) {
      if (unknown.length < 5) unknown.push({ subject: m.subject, text: m.text.replace(/\s+/g, ' ').trim().slice(0, 400) })
      continue
    }
    seen.add(m.id)
  }

  // Se aplica sobre lo guardado ahora, no sobre lo leído al empezar
  if (newAccounts.size || patched.size) {
    const fresh = readStore<Account[]>('fin-accounts', DEFAULT_ACCOUNTS)
    const merged = fresh.map((a) => (patched.has(a.id) ? { ...a, ...patched.get(a.id) } : a))
    for (const a of newAccounts.values()) if (!merged.some((x) => x.id === a.id)) merged.push({ ...a, ...patched.get(a.id) })
    accounts = merged
    saveStore('fin-accounts', merged)
  }
  const freshTxs = readStore<Tx[]>('fin-txs', [])
  const known = new Set(freshTxs.map((t) => t.id))
  const withNew = [...freshTxs, ...newTxs.filter((t) => !known.has(t.id))]
  const fixed = reconcileCards(withNew, accounts)
  if (newTxs.length || fixed !== withNew) saveStore('fin-txs', fixed)
  saveStore(SEEN_KEY, [...seen])
  saveStore(INIT_KEY, SENDERS)
  const prev = readStore<BankMailStatus>(STATUS_KEY, { at: 0, added: 0, balances: 0 })
  const status: BankMailStatus = { at: Date.now(), added, balances, lastBalance: lastBalance ?? prev.lastBalance, unknown }
  saveStore(STATUS_KEY, status)
  return status
}

let running: Promise<BankMailStatus> | null = null

/** Una sola lectura a la vez; los errores quedan en el estado para enseñarlos. */
export function runBankMail() {
  running ??= syncBankMail()
    .catch((e) => {
      const s = { ...readStore<BankMailStatus>(STATUS_KEY, { at: 0, added: 0, balances: 0 }), at: Date.now(), error: (e as Error).message }
      saveStore(STATUS_KEY, s)
      return s
    })
    .finally(() => { running = null })
  return running
}

/** Con Google conectado, lee los avisos al abrir el dashboard y cada 15 minutos. */
export function useBankMailWatcher(connected: boolean) {
  useEffect(() => {
    if (!connected) return
    const tick = () => {
      const s = readStore<BankMailStatus>(STATUS_KEY, { at: 0, added: 0, balances: 0 })
      // Tras un error (p. ej. sesión caducada y vuelta a conectar) se reintenta enseguida, sin esperar los 15 minutos
      if (!document.hidden && (s.error || Date.now() - s.at > 14 * 60_000)) runBankMail()
    }
    tick()
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [connected])
}
