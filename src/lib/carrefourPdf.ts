// Extracto mensual de Carrefour Pass en PDF → movimientos.
// "Detalle de tus operaciones": las compras (y devoluciones) del recibo, que es lo que se importa.
//   · "CARGO COMPRAS" no es un gasto: es el cobro en tu cuenta de las compras de días anteriores (Contado Inmediato).
//   · "Operaciones para el próximo recibo" se dejan para el extracto siguiente, donde vuelven a salir.
// Las compras con PayPal salen aquí como "PAYPAL *COMERCIO" o "PAYP…", porque PayPal tira de esta tarjeta.

import type { Cell } from './finance'

/** Líneas de texto de un PDF: cada una, sus trozos ordenados de izquierda a derecha. */
export async function pdfLines(buf: ArrayBuffer): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise
  const out: string[][] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const { items } = await (await doc.getPage(p)).getTextContent()
    const rows: { y: number; cells: [number, string][] }[] = []
    for (const it of items) {
      if (!('str' in it) || !it.str.trim()) continue
      const [x, y] = [it.transform[4], it.transform[5]]
      let row = rows.find((r) => Math.abs(r.y - y) <= 2)
      if (!row) rows.push((row = { y, cells: [] }))
      row.cells.push([x, it.str.trim()])
    }
    for (const r of rows.sort((a, b) => b.y - a.y)) out.push(r.cells.sort((a, b) => a[0] - b[0]).map((c) => c[1]))
  }
  return out
}

const DATE = /^\d{2}\/\d{2}\/\d{4}$/
const MONEY = /^-?[\d.]+,\d{2} ?€$/
const money = (s: string) => Number(s.replace(/[€\s.]/g, '').replace(',', '.'))

export interface CarrefourStatement {
  /** Cabecera y filas, como una hoja de cálculo: Fecha | Concepto | Importe (gasto en negativo) */
  rows: Cell[][]
  /** Lo que el extracto dice que suman las compras, y lo que suman las leídas */
  total: number | null
  sum: number
  /** Movimientos de "Operaciones para el próximo recibo" que no se importan */
  next: number
}

/** null si no es un extracto de Carrefour Pass. */
export function parseCarrefourPass(lines: string[][]): CarrefourStatement | null {
  const text = lines.map((l) => l.join(' ')).join('\n')
  if (!/Servicios Financieros Carrefour/i.test(text) || !/Detalle de tus operaciones/i.test(text)) return null
  const rows: Cell[][] = [['Fecha', 'Concepto', 'Importe']]
  let section: 'none' | 'detail' | 'next' = 'none'
  let total: number | null = null
  let sum = 0
  let next = 0
  for (const l of lines) {
    const joined = l.join(' ')
    if (/^Detalle de tus operaciones/i.test(joined)) { section = 'detail'; continue }
    if (/^Operaciones para el pr[oó]ximo recibo/i.test(joined)) { section = 'next'; continue }
    if (/^Total compras/i.test(joined)) {
      const m = l.find((c) => MONEY.test(c))
      if (m) total = (total ?? 0) + money(m)
      continue
    }
    if (section === 'none' || !DATE.test(l[0]) || !MONEY.test(l[l.length - 1])) continue
    if (section === 'next') { next++; continue }
    // Concepto y ciudad; fuera las referencias numéricas y el código de país (PAYP… · 4029357733 · FR)
    const desc = l.slice(1, -1).filter((c, k) => !k || !/^(\d+|[A-Z]{2})$/.test(c)).join(' · ').replace(/\\+$/, '').replace(/\\/g, ' ').trim()
    if (/^CARGO COMPRAS\b/i.test(desc)) continue
    const amount = money(l[l.length - 1])
    const [d, m, y] = l[0].split('/')
    sum += amount
    // En el extracto las compras van en positivo; en el dashboard un gasto es negativo
    rows.push([`${y}-${m}-${d}`, desc, -amount])
  }
  return { rows, total, sum: Math.round(sum * 100) / 100, next }
}
