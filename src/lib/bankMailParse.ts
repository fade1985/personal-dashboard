// Lectura de los avisos de CaixaBank por correo (sin dependencias, para poder probarla sola).

export interface MailMove { kind: 'account' | 'card'; date: string; amount: number; desc: string; ending: string; card?: string; type?: string }
export interface MailBalance { date: string; value: number; ending: string }

/** "01-11-26" → "2026-11-01" */
const ymd = (d: string) => {
  const [dd, mm, yy] = d.split(/[-/]/)
  return `${yy.length === 2 ? '20' + yy : yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
}
/** "56.963,10" → 56963.1 */
const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))

const D = String.raw`(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})`
const N = String.raw`(-?[\d.]+,\d{2})`

/** Saca todos los movimientos y saldos del texto de un aviso (un correo puede traer varios). */
export function parseCaixa(text: string): { moves: MailMove[]; balances: MailBalance[] } {
  const t = text.replace(/\s+/g, ' ')
  const moves: MailMove[] = []
  const balances: MailBalance[] = []

  // El 01-11-26 se ha realizado un CARGO de MYCARD en la cuenta acabada en 603 por un importe de 70,78 EUR.
  for (const m of t.matchAll(new RegExp(String.raw`El ${D} se ha realizado una? (.+?) de (.+?) en la cuenta acabada en (\d+) por un importe de ${N} EUR`, 'gi'))) {
    const type = m[2].trim()
    const income = /abono|ingreso|recibid|devoluci|n[oó]mina|transferencia a tu favor/i.test(type)
    moves.push({ kind: 'account', date: ymd(m[1]), type, desc: m[3].trim(), ending: m[4], amount: (income ? 1 : -1) * Math.abs(num(m[5])) })
  }

  // El 01-11-26 tienes un movimiento de 49,00 EUR en NEW FITNESS GROUP S.L - C con tu tarjeta MYCARD acabada en 1870.
  for (const m of t.matchAll(new RegExp(String.raw`El ${D} tienes un movimiento de ${N} EUR en (.+?) con tu tarjeta (.+?) acabada en (\d+)`, 'gi'))) {
    const refund = /devoluci|abono|anulaci/i.test(m[0])
    moves.push({ kind: 'card', date: ymd(m[1]), desc: m[3].trim(), card: m[4].trim(), ending: m[5], amount: (refund ? 1 : -1) * Math.abs(num(m[2])) })
  }

  // El saldo disponible en la cuenta acabada en 603 el día 01-11-26 es de 56.963,10 EUR.
  for (const m of t.matchAll(new RegExp(String.raw`saldo disponible en la cuenta acabada en (\d+) el d[ií]a ${D} es de ${N} EUR`, 'gi')))
    balances.push({ ending: m[1], date: ymd(m[2]), value: num(m[3]) })

  return { moves, balances }
}


// ---------- PayPal (servicio@paypal.es) ----------

export interface PayPalMove { kind: 'payment' | 'refund'; merchant: string; amount: number; /** pagado con el saldo de PayPal (no con tarjeta o banco) */ balance: boolean }

const EUR = String.raw`([\d.]+,\d{2})\s*€?\s*EUR`

/**
 * Asunto y texto de un correo de PayPal → pago o reembolso. Lo que no sea eso (envíos de dinero,
 * avisos de seguridad, publicidad) devuelve null.
 *   "Recibo de su pago a Cabify.com"                 / "Ha pagado 13,38 € EUR a Cabify.com"
 *   "ENEBA: 25,99 € EUR"                             / "Has autorizado un pago de 25,99 € EUR a ENEBA"
 *   "Su reembolso de Microsoft Payments está en camino" / "Hemos iniciado tu reembolso por 12,99 € EUR de Microsoft Payments"
 */
export function parsePayPal(subject: string, text: string): PayPalMove | null {
  const t = text.replace(/\s+/g, ' ')
  const s = subject.replace(/\s+/g, ' ').trim()
  const amount = (re: RegExp) => { const m = re.exec(t); return m ? num(m[1]) : null }
  const balance = /saldo de paypal|paypal balance/i.test(t) && !/(visa|mastercard|tarjeta|cuenta bancaria|banco)\b.{0,40}\d{4}/i.test(t)

  let m = /reembolso de (.+?) est[aá] en camino/i.exec(s)
  if (m || /reembolso por/i.test(t)) {
    const v = amount(new RegExp(String.raw`reembolso (?:por|de) ${EUR}`, 'i'))
    const merchant = m?.[1] ?? new RegExp(String.raw`reembolso por ${EUR} de (.+?)(?:\.| Los| El| Si| Puede|$)`, 'i').exec(t)?.[2]
    return v != null && merchant ? { kind: 'refund', merchant: merchant.trim(), amount: v, balance } : null
  }

  const v = amount(new RegExp(String.raw`(?:ha(?:s)? pagado|autorizado un pago de)\s+${EUR}`, 'i'))
  if (v == null) return null
  m = /recibo de (?:su|tu) pago a (.+)$/i.exec(s) ?? /^(.+?):\s*[\d.]+,\d{2}\s*€/.exec(s)
  const merchant = m?.[1] ?? new RegExp(String.raw`(?:pagado|pago de)\s+${EUR}\s+a\s+(.+?)(?:\.| Detalles| Fecha| Id| N\.| Hola|$)`, 'i').exec(t)?.[2]
  return merchant ? { kind: 'payment', merchant: merchant.trim(), amount: v, balance } : null
}
