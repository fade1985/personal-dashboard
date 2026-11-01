// Avisos de CaixaBank por correo (alerta@caixabank.com) → movimientos y saldos, sin importar el extracto.
//   "Movimientos de tarjetas":            compras con la tarjeta (MyCard, de crédito: se pagan de golpe a fin de mes)
//   "Todos los movimientos de la cuenta": cargos y abonos en la cuenta (el cargo de MYCARD es el pago de la tarjeta)
//   "Saldo a una fecha concreta":         saldo disponible de la cuenta ese día
// Se leen de tu Gmail desde el navegador, con el mismo permiso de lectura que la tarjeta de Correo.

import { useEffect } from 'react'
import { gapi } from './google'
import { readStore, saveStore } from './storage'
import { DEFAULT_ACCOUNTS, categorize, type Account, type Rule, type Tx } from './finance'
import { parseCaixa } from './bankMailParse'

export { parseCaixa }

const FROM = 'alerta@caixabank.com'
const SEEN_KEY = 'bankmail-seen'
export const STATUS_KEY = 'bankmail-status'

export interface BankMailStatus { at: number; added: number; balances: number; error?: string }

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

async function listIds(days: number) {
  const ids: string[] = []
  let page: string | undefined
  do {
    const q = encodeURIComponent(`from:${FROM} newer_than:${days}d`)
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
  const first = seen.size === 0
  const ids = (await listIds(first ? 90 : 20)).filter((id) => !seen.has(id))

  const mails: { id: string; at: number; text: string }[] = []
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = await Promise.all(ids.slice(i, i + 10).map((id) =>
      gapi<{ id: string; internalDate: string; payload: Part }>(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`)
        .then((m) => ({ id: m.id, at: Number(m.internalDate), text: bodyText(m.payload) }))))
    mails.push(...chunk)
  }
  mails.sort((a, b) => a.at - b.at)

  let accounts = readStore<Account[]>('fin-accounts', DEFAULT_ACCOUNTS)
  let txs = readStore<Tx[]>('fin-txs', [])
  const rules = readStore<Rule[]>('fin-rules', [])
  const have = new Set(txs.map((t) => t.id))
  let added = 0, balances = 0

  const ensureBank = (ending: string) => {
    let a = findBank(accounts, ending)
    if (!a) {
      a = { id: `caixa-${ending}`, name: 'CaixaBank', kind: 'bank', color: '#0b8fd6', emoji: '⭐', domain: 'caixabank.es', ending }
      accounts = [...accounts, a]
    } else if (a.ending !== ending) {
      const withEnding = { ...a, ending }
      accounts = accounts.map((x) => (x.id === a!.id ? withEnding : x))
      a = withEnding
    }
    return a
  }
  const ensureCard = (ending: string, card = 'Tarjeta') => {
    let a = accounts.find((x) => x.ending === ending)
    if (!a) {
      a = { id: `caixa-card-${ending}`, name: `${cap(card)} CaixaBank`, kind: 'card', color: '#0b8fd6', emoji: '💳', domain: 'caixabank.es', ending }
      accounts = [...accounts, a]
    }
    return a
  }
  const cardNames = () => accounts.filter((a) => a.kind === 'card' && a.ending).map((a) => a.name.split(' ')[0].toLowerCase())
  const push = (t: Tx) => {
    if (have.has(t.id)) return
    have.add(t.id)
    txs = [...txs, t]
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
      // "CARGO de MYCARD": el pago mensual de la tarjeta. No es gasto (las compras ya están en la tarjeta)
      const settles = mv.amount < 0 && (/\bmycard\b/i.test(mv.desc) || cardNames().includes(mv.desc.toLowerCase()))
      push({ id, accountId: bank.id, date: mv.date, desc: mv.desc, amount: mv.amount, category: settles ? 'transfer' : categorize(mv.desc, mv.amount, rules), source: 'mail' })
      if (settles) {
        const card = accounts.find((a) => a.kind === 'card' && a.ending && /caixa/i.test(a.name + (a.domain ?? '')))
        if (card) {
          // Deja la tarjeta a cero como mucho: las compras anteriores a la primera lectura no las conocemos
          const owed = -txs.filter((t) => t.accountId === card.id && t.date <= mv.date).reduce((s, t) => s + t.amount, 0)
          const paid = Math.min(-mv.amount, Math.max(0, Math.round(owed * 100) / 100))
          if (paid > 0) push({ id: `${id}:card`, accountId: card.id, date: mv.date, desc: 'Pago de la tarjeta', amount: paid, category: 'transfer', source: 'mail' })
        }
      }
    })
    for (const b of bals) {
      const bank = ensureBank(b.ending)
      if (!bank.manual || bank.manual.at <= b.date) {
        accounts = accounts.map((a) => (a.id === bank.id ? { ...a, manual: { value: b.value, at: b.date } } : a))
        balances++
      }
    }
    seen.add(m.id)
  }

  if (added) saveStore('fin-txs', txs)
  if (added || balances || accounts.length !== readStore<Account[]>('fin-accounts', DEFAULT_ACCOUNTS).length) saveStore('fin-accounts', accounts)
  saveStore(SEEN_KEY, [...seen])
  const status = { at: Date.now(), added, balances }
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
      if (!document.hidden && Date.now() - s.at > 14 * 60_000) runBankMail()
    }
    tick()
    const t = setInterval(tick, 60_000)
    return () => clearInterval(t)
  }, [connected])
}
