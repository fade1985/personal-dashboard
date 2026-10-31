import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Pencil, X } from 'lucide-react'
import { eur } from '../lib/finance'
import { useHistory, type Point, type Position } from '../lib/portfolio'
import { Money } from './Finance'

const fmt = (v: number, max = 6) => v.toLocaleString('es-ES', { maximumFractionDigits: max })
const pct = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
const DAY = 864e5

const RANGES = [
  { id: '1D', days: 0 },
  { id: '1S', days: 7 },
  { id: '1M', days: 31 },
  { id: '6M', days: 183 },
  { id: '1A', days: 365 },
  { id: '5A', days: 1827 },
  { id: 'Máx', days: Infinity },
] as const
type RangeId = (typeof RANGES)[number]['id']

/** Como mucho ~400 puntos para dibujar, conservando el último. */
function thin(pts: Point[], max = 400) {
  if (pts.length <= max) return pts
  const step = pts.length / max
  const out: Point[] = []
  for (let i = 0; i < max; i++) out.push(pts[Math.floor(i * step)])
  if (out.at(-1) !== pts.at(-1)) out.push(pts.at(-1)!)
  return out
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const when = (t: number, intraday: boolean) => intraday
  ? new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  : new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

/** Precio en el tiempo, con tu precio medio y las compras encima; el cursor muestra cada punto. */
function PriceChart({ pts, base, avg, buys, intraday, up }: {
  pts: Point[]; base: number; avg: number; buys: { t: number; price: number }[]; intraday: boolean; up: boolean
}) {
  const [ref, w] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const h = 270, padT = 58, padB = 22
  const t0 = pts[0][0], t1 = pts.at(-1)![0]
  const vals = pts.map((p) => p[1])
  let lo = Math.min(...vals, intraday ? base : Infinity), hi = Math.max(...vals, intraday ? base : -Infinity)
  // El precio medio entra en la escala si no la aplasta
  const span = hi - lo || hi * 0.02 || 1
  const showAvg = avg > 0 && avg > lo - span * 0.6 && avg < hi + span * 0.6
  if (showAvg) { lo = Math.min(lo, avg); hi = Math.max(hi, avg) }
  const pad = (hi - lo || 1) * 0.06
  lo -= pad; hi += pad
  const x = (t: number) => (t1 === t0 ? w / 2 : ((t - t0) / (t1 - t0)) * w)
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')
  const col = up ? 'var(--green)' : 'var(--red)'
  const visibleBuys = buys.filter((b) => b.t >= t0 - DAY / 2 && b.t <= t1 + DAY / 2 && b.price >= lo && b.price <= hi)
  const hp = hover != null ? pts[hover] : null
  const legend = (
    <div className="pfd-legend faint">
      {showAvg && <span><i className="pfd-key avg" /> Tu precio medio</span>}
      {visibleBuys.length > 0 && <span><i className="pfd-key buy" /> Tus compras</span>}
      {intraday && <span><i className="pfd-key ref" /> Cierre anterior</span>}
      <span>Máx. {eur(Math.max(...vals))} · Mín. {eur(Math.min(...vals))}</span>
    </div>
  )

  const onMove = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const t = t0 + ((e.clientX - r.left) / r.width) * (t1 - t0)
    let best = 0
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i][0] - t) < Math.abs(pts[best][0] - t)) best = i
    setHover(best)
  }

  return (
    <>
    <div className="pfd-chart" ref={ref} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
      {w > 0 && (
        <svg width={w} height={h} role="img" aria-label="Evolución del precio">
          <defs>
            <linearGradient id="pfd-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={col} stopOpacity={0.22} />
              <stop offset="1" stopColor={col} stopOpacity={0} />
            </linearGradient>
          </defs>
          {intraday && <line className="pfd-ref" x1={0} x2={w} y1={y(base)} y2={y(base)} />}
          {showAvg && (
            <g className="pfd-avg">
              <line x1={0} x2={w} y1={y(avg)} y2={y(avg)} />
              <text x={4} y={y(avg) - 5}>Tu precio medio {eur(avg)}</text>
            </g>
          )}
          <path d={`${line}L${x(t1)},${h - padB}L${x(t0)},${h - padB}Z`} fill="url(#pfd-fill)" />
          <path d={line} fill="none" stroke={col} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {visibleBuys.map((b, i) => (
            <circle key={i} className="pfd-buy" cx={x(Math.min(t1, Math.max(t0, b.t)))} cy={y(b.price)} r={5}>
              <title>Compra a {eur(b.price)}</title>
            </circle>
          ))}
          <text className="pfd-axis" x={0} y={h - 5}>{when(t0, intraday)}</text>
          <text className="pfd-axis" x={w} y={h - 5} textAnchor="end">{when(t1, intraday)}</text>
          {hp && (
            <g>
              <line className="pfd-cross" x1={x(hp[0])} x2={x(hp[0])} y1={padT} y2={h - padB} />
              <circle cx={x(hp[0])} cy={y(hp[1])} r={5} fill={col} stroke="var(--panel-solid)" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {hp && (
        <div className="pfd-tip" style={{ left: Math.min(Math.max(x(hp[0]), 70), w - 70) } as CSSProperties}>
          <b>{eur(hp[1])}</b>
          <span className={hp[1] >= base ? 'pos' : 'neg'}>{pct(hp[1] / base - 1)}</span>
          <small>{intraday ? `${when(hp[0], true)} · ${new Date(hp[0]).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}` : when(hp[0], false)}</small>
        </div>
      )}
    </div>
    {legend}
    </>
  )
}

export function HoldingDetail({ p, total, accountName, color, onEdit, onClose }: {
  p: Position; total: number; accountName?: string; color: string; onEdit: () => void; onClose: () => void
}) {
  const q = p.quote
  const key = (p.holding.symbol || p.holding.isin).trim().toUpperCase()
  const hist = useHistory(key)
  const hasIntraday = (hist.data?.intraday.length ?? 0) > 1
  const fund = q?.daily || (hist.data && !hasIntraday)
  const [range, setRange] = useState<RangeId | null>(null)
  const r = range ?? (fund ? '1M' : '1D')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const view = useMemo(() => {
    const d = hist.data
    if (!d) return null
    if (r === '1D') {
      if (d.intraday.length < 2) return null
      return { pts: thin(d.intraday), base: q?.prevClose ?? d.intraday[0][1], intraday: true }
    }
    const days = RANGES.find((x) => x.id === r)!.days
    let pts = d.daily
    // Con el precio de ahora al final, si es más nuevo que el último cierre
    if (q && pts.length && q.time > pts.at(-1)![0] + 60 * 60e3) pts = [...pts, [q.time, q.price]]
    else if (q && pts.length) pts = [...pts.slice(0, -1), [pts.at(-1)![0], q.price]]
    const from = (pts.at(-1)?.[0] ?? Date.now()) - days * DAY
    pts = pts.filter((x) => x[0] >= from)
    if (pts.length < 2) return null
    return { pts: thin(pts), base: pts[0][1], intraday: false }
  }, [hist.data, r, q])

  const last = view?.pts.at(-1)?.[1] ?? q?.price ?? 0
  const change = view ? last - view.base : 0
  const changePct = view && view.base ? last / view.base - 1 : 0
  const lots = [...p.holding.lots].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const buys = lots.filter((l) => l.date).map((l) => ({ t: new Date(`${l.date}T12:00:00`).getTime(), price: l.price }))
  const label = { '1D': 'en la sesión', '1S': 'en una semana', '1M': 'en un mes', '6M': 'en 6 meses', '1A': 'en un año', '5A': 'en 5 años', Máx: 'desde el inicio' }[r]
  const initials = p.holding.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal single pfd" onClick={(e) => e.stopPropagation()} style={{ '--ac': color } as CSSProperties}>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>

        <div className="pfd-top">
          <span className="pf-logo">{initials}</span>
          <div>
            <h2>{p.holding.name}</h2>
            <small className="faint">
              {p.holding.isin}{q ? ` · ${q.symbol !== p.holding.isin ? `${q.symbol} · ` : ''}${q.exchange}` : ''}{accountName ? ` · ${accountName}` : ''}
            </small>
          </div>
        </div>

        <div className="pfd-price">
          <b>{q ? eur(last) : '—'}</b>
          {view && <span className={change >= 0 ? 'pos' : 'neg'}>{change >= 0 ? '▲' : '▼'} {eur(Math.abs(change))} ({pct(changePct)}) <small>{label}</small></span>}
          {q && q.currency !== 'EUR' && <small className="faint">{q.native.toLocaleString('es-ES', { style: 'currency', currency: q.currency })} en su mercado</small>}
          {q && (
            <small className="faint">
              {fund
                ? `Fondo: se valora una vez al día · valor del ${new Date(q.time).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })}`
                : `Cotización de ${new Date(q.time).toLocaleString('es-ES', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}`}
            </small>
          )}
        </div>

        <div className="pfd-ranges" role="tablist">
          {RANGES.filter((x) => x.id !== '1D' || !fund).map((x) => (
            <button key={x.id} role="tab" aria-selected={r === x.id} className={r === x.id ? 'on' : ''} onClick={() => setRange(x.id)}>{x.id}</button>
          ))}
        </div>

        {view ? (
          <PriceChart pts={view.pts} base={view.base} avg={p.avg} buys={buys} intraday={view.intraday} up={change >= 0} />
        ) : (
          <div className="pfd-chart pfd-empty">{hist.error ? `No se pudo cargar el histórico (${hist.error})` : hist.data ? 'Sin datos para este periodo' : 'Cargando gráfica…'}</div>
        )}

        <div className="pfd-stats">
          <div><small>Tu posición</small><b><Money v={p.value ?? p.cost} /></b></div>
          <div><small>Rentabilidad</small><b className={(p.gain ?? 0) >= 0 ? 'pos' : 'neg'}>{p.gain != null ? <><Money v={p.gain} sign /> <em>{pct(p.gainPct!)}</em></> : '—'}</b></div>
          <div><small>{fund ? 'Último valor' : q && new Date(q.time).toDateString() !== new Date().toDateString() ? 'Última sesión' : 'Hoy'}</small><b className={(p.day ?? 0) >= 0 ? 'pos' : 'neg'}>{p.day != null ? <><Money v={p.day} sign /> <em>{pct(p.dayPct ?? 0)}</em></> : '—'}</b></div>
          <div><small>Participaciones</small><b>{fmt(p.qty)}</b></div>
          <div><small>Precio medio</small><b>{eur(p.avg, 2)}</b></div>
          <div><small>Invertido</small><b><Money v={p.cost} /></b></div>
          <div><small>Comisiones</small><b>{eur(p.fees)}</b></div>
          <div><small>Peso en la cartera</small><b>{total > 0 && p.value != null ? pct(p.value / total).replace('+', '') : '—'}</b></div>
        </div>

        <h3 className="pfd-h3">Tus compras</h3>
        <div className="pfd-lots">
          <div className="pfd-lot head"><span>Fecha</span><span>Particip.</span><span>Precio</span><span>Vale hoy</span><span>+/−</span></div>
          {lots.map((l) => {
            const cost = l.qty * l.price + l.fee
            const now = q ? l.qty * q.price : null
            return (
              <div className="pfd-lot" key={l.id}>
                <span>{l.date ? new Date(`${l.date}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' }) : '—'}</span>
                <span>{fmt(l.qty)}</span>
                <span>{eur(l.price)}</span>
                <span>{now != null ? <Money v={now} /> : '—'}</span>
                <span className={now != null && now >= cost ? 'pos' : 'neg'}>{now != null ? <><Money v={now - cost} sign /> <small>{pct(now / cost - 1)}</small></> : '—'}</span>
              </div>
            )
          })}
        </div>

        <button className="btn ghost pfd-edit" onClick={onEdit}><Pencil size={14} /> Editar compras</button>
      </div>
    </div>
  )
}
