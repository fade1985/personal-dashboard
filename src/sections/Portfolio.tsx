import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChartCandlestick, FileUp, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { Card, CardTitle } from '../components/ui'
import { eur, type Account } from '../lib/finance'
import { parseWiseStatement, position, quoteKey, searchSymbols, summarize, useHistory, usePortfolio, type Holding, type Lot, type Position } from '../lib/portfolio'
import { Money } from './Finance'
import { HoldingDetail, Logo } from './PortfolioDetail'
import { AccountIcon } from '../components/AccountIcon'

const C = '#22d3ee'

/** Acepta "3,000712", "1.234,5" y "140.30". */
const parseNum = (s: string) => {
  const t = s.trim().replace(/\s|€/g, '')
  if (!t) return NaN
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
}
const fmt = (v: number, max = 6) => v.toLocaleString('es-ES', { maximumFractionDigits: max })
const pct = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60e3)
  if (m < 1) return 'ahora'
  if (m < 60) return `hace ${m} min`
  const d = new Date(t)
  return d.toDateString() === new Date().toDateString()
    ? `a las ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
    : d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
}

function Spark({ points, up }: { points: number[]; up: boolean }) {
  if (points.length < 2) return <span className="pf-spark" />
  const w = 96, h = 30
  const lo = Math.min(...points), hi = Math.max(...points)
  const xy = points.map((v, i) => `${(i / (points.length - 1)) * w},${h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4)}`)
  const col = up ? 'var(--green)' : 'var(--red)'
  return (
    <svg className="pf-spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={xy.join(' ')} fill="none" stroke={col} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** Cartera de una cuenta (Trade Republic, Wise…), con sus propios totales. Sin `account`, todas juntas. */
export function PortfolioCard({ accounts, account, i, className = 'span-12', compact, onEditAccount }: {
  accounts: Account[]; account?: Account; i: number; className?: string
  /** Tarjeta estrecha: cifras en dos columnas y, con un solo fondo, la gráfica de su valor */
  compact?: boolean
  onEditAccount?: () => void
}) {
  const all = usePortfolio()
  const { updatedAt, setHoldings } = all
  const positions = account ? all.positions.filter((p) => p.holding.accountId === account.id) : all.positions
  const totals = account ? summarize(positions) : all.totals
  const [editing, setEditing] = useState<Holding | 'new' | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const shown = positions.find((p) => p.holding.id === viewing)
  const shownAccount = shown && accounts.find((a) => a.id === shown.holding.accountId)
  const invest = accounts.filter((a) => a.kind === 'invest')
  const [note, setNote] = useState<string | null>(null)
  const isWise = account && /wise/i.test(`${account.id} ${account.name}`)

  /** Extracto CSV de Wise → una posición por ISIN con sus compras y las comisiones cobradas en participaciones. */
  const importWise = async (file: File) => {
    try {
      const found = parseWiseStatement(await file.text())
      if (!found.size) return setNote('El extracto no trae compras de fondos o acciones')
      const names: Record<string, string> = {}
      await Promise.all([...found.keys()].map(async (isin) => {
        const r = await fetch(`/api/quote?q=${encodeURIComponent(isin)}`).then((x) => x.json()).catch(() => null)
        if (r?.[isin]?.name) names[isin] = r[isin].name
      }))
      // El extracto (desde que abriste la cuenta) es la única fuente: sustituye todo lo que hubiera en esta cuenta
      setHoldings((l) => {
        const mine = l.filter((h) => h.accountId === account!.id)
        const fresh = [...found].map(([isin, lots]) => {
          const prev = mine.find((h) => h.isin === isin)
          return prev ? { ...prev, lots } : { id: crypto.randomUUID(), isin, name: names[isin] ?? isin, accountId: account!.id, lots }
        })
        return [...l.filter((h) => h.accountId !== account!.id), ...fresh]
      })
      const n = [...found.values()].flat()
      setNote(`Importado: ${n.filter((x) => !x.kind).length} compras y ${n.filter((x) => x.kind === 'fee').length} cobros de comisión`)
    } catch (e) {
      setNote(`No se pudo importar: ${(e as Error).message}`)
    }
  }
  // Fines de semana y festivos: el cambio es el de la última sesión
  const lastTrade = Math.max(0, ...positions.map((p) => p.quote?.time ?? 0))
  const dayLabel = !lastTrade || new Date(lastTrade).toDateString() === new Date().toDateString()
    ? 'Hoy' : `El ${new Date(lastTrade).toLocaleDateString('es-ES', { weekday: 'long' })}`

  return (
    <Card className={`${className} pf ${compact ? 'pf-compact' : ''}`} i={i} accent={account?.color ?? C}>
      <CardTitle
        icon={account ? <AccountIcon a={account} /> : <ChartCandlestick size={16} />} color={account?.color ?? C}
        title={account ? account.name : 'Cartera'}
        right={
          <div className="row" style={{ gap: 4 }}>
            {isWise && (
              <label className="btn sm ghost" title="CSV de Wise: Cuenta en EUR → Extractos → CSV">
                <FileUp size={14} /> Importar extracto
                <input type="file" accept=".csv" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importWise(f) }} />
              </label>
            )}
            {!isWise && <button className="btn sm ghost" onClick={() => setEditing('new')}><Plus size={14} /> Añadir posición</button>}
            {onEditAccount && <button className="icon-btn" onClick={onEditAccount} title="Editar cuenta"><Pencil size={14} /></button>}
          </div>
        }
      />
      {note && <div className="notice" style={{ marginBottom: 12 }}>{note} <button className="icon-btn" style={{ marginLeft: 'auto', width: 26, height: 26 }} onClick={() => setNote(null)}><X size={13} /></button></div>}
      {totals && (
        <div className="pf-head">
          <div>
            <div className="muted" style={{ fontSize: 13 }}>Valor ahora <span className="pf-live" title="Cotización en vivo, se actualiza cada minuto" /></div>
            <div className="pf-value"><Money v={totals.value} /></div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 13 }}>{dayLabel}</div>
            <div className={`pf-num ${totals.day >= 0 ? 'pos' : 'neg'}`}><Money v={totals.day} sign /> <small>{pct(totals.dayPct)}</small></div>
          </div>
          <div>
            <div className="muted" style={{ fontSize: 13 }}>Desde que compraste</div>
            <div className={`pf-num ${totals.gain >= 0 ? 'pos' : 'neg'}`}><Money v={totals.gain} sign /> <small>{pct(totals.gainPct)}</small></div>
          </div>
          {!compact && <div className="faint" style={{ fontSize: 12, alignSelf: 'end' }}>Actualizado {ago(updatedAt)}</div>}
        </div>
      )}
      {compact && positions.length === 1 && <ValueChart holding={positions[0].holding} price={positions[0].quote?.price} color={account?.color ?? C} />}
      {positions.length ? (
        <div className="pf-list">
          {positions.map((p) => <Row key={p.holding.id} p={p} account={accounts.find((a) => a.id === p.holding.accountId)} onOpen={() => setViewing(p.holding.id)} />)}
        </div>
      ) : (
        <div className="empty">
          <div className="big">📈</div>
          <p>{isWise
            ? 'Importa el extracto CSV de Wise (desde que empezaste): compras y comisiones salen de ahí.'
            : 'Añade tus acciones o fondos con su ISIN y tus compras: el valor se actualiza solo con la cotización.'}</p>
        </div>
      )}
      {shown && !editing && createPortal(
        <HoldingDetail
          p={shown} total={totals?.value ?? 0} accountName={shownAccount?.name} color={shownAccount?.color ?? C}
          onEdit={isWise ? undefined : () => setEditing(shown.holding)} onClose={() => setViewing(null)}
        />,
        document.body,
      )}
      {editing && createPortal(
        <HoldingModal
          holding={editing === 'new' ? null : editing} accounts={(invest.length ? invest : accounts).filter((a) => !/wise/i.test(`${a.id} ${a.name}`))} defaultAccountId={account?.id}
          onClose={() => setEditing(null)}
          onSave={(h) => {
            setHoldings((l) => (l.some((x) => x.id === h.id) ? l.map((x) => (x.id === h.id ? h : x)) : [...l, h]))
            setEditing(null)
          }}
          onDelete={(id) => {
            setHoldings((l) => l.filter((x) => x.id !== id))
            setEditing(null)
            setViewing(null)
          }}
        />,
        document.body,
      )}
    </Card>
  )
}

const DAY = 864e5

/**
 * Valor de la cuenta desde la primera compra (participaciones de cada día × precio de ese día) frente a lo aportado.
 * Para las carteras de un solo fondo, que si no dejan la tarjeta medio vacía.
 */
function ValueChart({ holding, price: live, color }: { holding: Holding; price?: number; color: string }) {
  const hist = useHistory(quoteKey(holding))
  const [hover, setHover] = useState<number | null>(null)
  const lots = [...holding.lots].filter((l) => l.date).sort((a, b) => a.date!.localeCompare(b.date!))
  const start = lots[0] ? Date.parse(`${lots[0].date}T00:00:00`) : 0
  let daily = (hist.data?.daily ?? []).filter(([t]) => t >= start - DAY)
  // Termina en el precio de ahora, el mismo con el que se calcula el valor de la tarjeta
  if (live && daily.length) daily = [...daily.filter(([t]) => t < Date.now() - 12 * 36e5), [Date.now(), live]]
  if (!lots.length || daily.length < 2) {
    return <div className="pf-chart empty-chart faint">{hist.error ? 'Sin histórico de este fondo' : 'Cargando evolución…'}</div>
  }
  // Una muestra por semana basta y deja la línea limpia
  const step = Math.max(1, Math.floor(daily.length / 160))
  const pts = daily.filter((_, k) => k % step === 0 || k === daily.length - 1).map(([t, price]) => {
    let qty = 0, put = 0
    for (const l of lots) {
      if (Date.parse(`${l.date}T23:59:59`) > t) break
      qty += l.qty
      put += l.kind ? l.qty * l.price : l.qty * l.price + l.fee
    }
    return { t, value: qty * price, put }
  })
  const w = 600, h = 150, pad = 4
  const hi = Math.max(...pts.map((p) => Math.max(p.value, p.put))) * 1.04
  const x = (k: number) => (k / (pts.length - 1)) * w
  const y = (v: number) => h - pad - (v / hi) * (h - pad * 2)
  const line = (f: (p: (typeof pts)[number]) => number) => pts.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(f(p)).toFixed(1)}`).join('')
  // Lo aportado sube a escalones (cada recarga), no en diagonal
  const steps = pts.map((p, k) => `${k ? `L${x(k).toFixed(1)},${y(pts[k - 1].put).toFixed(1)}L` : 'M'}${x(k).toFixed(1)},${y(p.put).toFixed(1)}`).join('')
  const sel = pts[hover ?? pts.length - 1]
  const when = new Date(sel.t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <div className="pf-chart" style={{ '--ac': color } as CSSProperties}>
      <div className="pf-chart-legend">
        <span><i style={{ background: color }} /> Valor <b><Money v={sel.value} decimals={0} /></b></span>
        <span><i className="put" /> Aportado <b><Money v={sel.put} decimals={0} /></b></span>
        <span className={sel.value - sel.put >= 0 ? 'pos' : 'neg'}><Money v={sel.value - sel.put} sign decimals={0} /></span>
        <small className="faint">{hover == null ? 'Hoy' : when}</small>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.round(((e.clientX - r.left) / r.width) * (pts.length - 1))) }}
        onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`pfv-${holding.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".32" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line((p) => p.value)}L${w},${h}L0,${h}Z`} fill={`url(#pfv-${holding.id})`} />
        <path d={steps} fill="none" stroke="var(--faint)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={line((p) => p.value)} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={h} stroke="var(--border-2)" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="pf-chart-axis faint">
        <span>{new Date(pts[0].t).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' })}</span>
        <span>Hoy</span>
      </div>
    </div>
  )
}

function Row({ p, account, onOpen }: { p: Position; account?: Account; onOpen: () => void }) {
  const q = p.quote
  return (
    <button className="pf-row" onClick={onOpen} style={{ '--ac': account?.color ?? C } as CSSProperties}>
      <Logo isin={p.holding.isin} name={p.holding.name} />
      <span className="pf-main">
        <b>{p.holding.name}</b>
        <small>
          {fmt(p.qty)} × <Money v={p.avg} /> de media
          {q ? <> · {q.symbol === p.holding.isin ? '' : `${q.symbol} · `}{q.exchange}</> : p.error ? <> · <span className="neg">{p.error}</span></> : ' · cargando…'}
        </small>
      </span>
      <Spark points={q?.spark ?? []} up={q?.daily ? (q.spark.at(-1) ?? 0) >= (q.spark[0] ?? 0) : (p.day ?? 0) >= 0} />
      <span className="pf-price">
        {q ? eur(q.price) : '—'}
      </span>
      <span className="pf-figs">
        <b>{p.value != null ? <Money v={p.value} /> : <Money v={p.cost} />}</b>
        {p.dayPct != null && <small className={p.dayPct >= 0 ? 'pos' : 'neg'}>{q?.daily ? 'Últ. valor' : q && new Date(q.time).toDateString() !== new Date().toDateString() ? 'Últ. sesión' : 'Hoy'} {pct(p.dayPct)}</small>}
        {p.gain != null && <small className={p.gain >= 0 ? 'pos' : 'neg'}><Money v={p.gain} sign /> ({pct(p.gainPct!)})</small>}
      </span>
    </button>
  )
}

interface LotDraft { id: string; date: string; qty: string; price: string; fee: string }
const draftOf = (l: Lot): LotDraft => ({ id: l.id, date: l.date ?? '', qty: fmt(l.qty, 8), price: fmt(l.price, 6), fee: fmt(l.fee, 2) })
const blankLot = (): LotDraft => ({ id: crypto.randomUUID(), date: '', qty: '', price: '', fee: '1' })

function HoldingModal({ holding, accounts, defaultAccountId, onClose, onSave, onDelete }: {
  holding: Holding | null; accounts: Account[]; defaultAccountId?: string; onClose: () => void; onSave: (h: Holding) => void; onDelete: (id: string) => void
}) {
  const [isin, setIsin] = useState(holding?.isin ?? '')
  const [name, setName] = useState(holding?.name ?? '')
  const [accountId, setAccountId] = useState(holding?.accountId ?? defaultAccountId ?? accounts.find((a) => a.id === 'traderepublic')?.id ?? accounts[0]?.id ?? '')
  const [symbol, setSymbol] = useState(holding?.symbol ?? '')
  const [lots, setLots] = useState<LotDraft[]>(holding?.lots.filter((l) => !l.kind).map(draftOf) ?? [blankLot()])
  const outs = holding?.lots.filter((l) => l.kind) ?? []
  const [found, setFound] = useState<Awaited<ReturnType<typeof searchSymbols>> | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsed: Lot[] = lots
    .map((l) => ({ id: l.id, date: l.date || undefined, qty: parseNum(l.qty), price: parseNum(l.price), fee: parseNum(l.fee) || 0 }))
    .filter((l) => l.qty > 0 && l.price > 0)
  const allLots = [...parsed, ...outs]
  const draft: Holding = { id: holding?.id ?? crypto.randomUUID(), isin: isin.trim().toUpperCase(), name: name.trim() || isin.trim().toUpperCase(), accountId, symbol: symbol.trim().toUpperCase() || undefined, lots: allLots }
  const sum = position(draft)
  const validIsin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(draft.isin)

  const search = async () => {
    const text = name.trim() || draft.isin
    if (!text) return
    setSearching(true)
    setError(null)
    try {
      const r = await searchSymbols(draft.isin && !symbol ? draft.isin : text)
      setFound(r.length ? r : (draft.isin && name.trim() ? await searchSymbols(name.trim()) : r))
    } catch (e) {
      setError(`No se pudo buscar (${(e as Error).message})`)
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => setFound(null), [isin])

  const save = () => {
    if (!validIsin && !draft.symbol) return setError('Pon el ISIN (12 caracteres, p. ej. US84615Q1031) o elige un símbolo')
    if (!parsed.length) return setError('Añade al menos una compra con participaciones y precio')
    onSave(draft)
  }

  const setLot = (id: string, k: keyof LotDraft, v: string) => setLots((l) => l.map((x) => (x.id === id ? { ...x, [k]: v } : x)))

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal single pf-modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose}><X size={18} /></button>
        <h2>{holding ? holding.name : 'Nueva posición'}</h2>
        <div className="form-grid">
          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <label className="field" style={{ flex: '1 1 170px' }}>
              <span>ISIN</span>
              <input className="input" value={isin} onChange={(e) => setIsin(e.target.value)} placeholder="US84615Q1031" autoFocus={!holding} spellCheck={false} />
            </label>
            <label className="field" style={{ flex: '1 1 170px' }}>
              <span>Nombre</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="SpaceX" />
            </label>
          </div>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: '1 1 150px' }}>
              <span>Cuenta</span>
              <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
              </select>
            </label>
            <label className="field" style={{ flex: '1 1 150px' }}>
              <span>Símbolo (opcional)</span>
              <input className="input" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="Automático (Lang & Schwarz)" spellCheck={false} />
            </label>
            <button className="btn sm ghost" onClick={search} disabled={searching || !(name.trim() || isin.trim())}><Search size={13} /> {searching ? 'Buscando…' : 'Buscar cotización'}</button>
          </div>
          {found && (
            <div className="pf-found">
              {found.length ? found.map((f) => (
                <button key={f.symbol} className={symbol.toUpperCase() === f.symbol ? 'on' : ''} onClick={() => { setSymbol(f.symbol); if (!name.trim()) setName(f.name) }}>
                  <b>{f.symbol}</b> <span>{f.name}</span> <small>{f.exchange}</small>
                </button>
              )) : <p className="faint">No aparece nada. Prueba con el nombre de la empresa.</p>}
            </div>
          )}

          <div className="pf-lots">
            <div className="pf-lot head"><span>Fecha</span><span>Participaciones</span><span>Precio (€)</span><span>Comisión</span><span /></div>
            {lots.map((l) => (
              <div className="pf-lot" key={l.id}>
                <input className="input" type="date" value={l.date} onChange={(e) => setLot(l.id, 'date', e.target.value)} />
                <input className="input" inputMode="decimal" value={l.qty} onChange={(e) => setLot(l.id, 'qty', e.target.value)} placeholder="3,000712" />
                <input className="input" inputMode="decimal" value={l.price} onChange={(e) => setLot(l.id, 'price', e.target.value)} placeholder="140,30" />
                <input className="input" inputMode="decimal" value={l.fee} onChange={(e) => setLot(l.id, 'fee', e.target.value)} />
                <button className="icon-btn" title="Quitar compra" onClick={() => setLots((x) => x.filter((y) => y.id !== l.id))} disabled={lots.length === 1}><Trash2 size={14} /></button>
              </div>
            ))}
            <button className="btn sm ghost" onClick={() => setLots((x) => [...x, blankLot()])}><Plus size={13} /> Añadir compra</button>
            {outs.length > 0 && (
              <small className="faint">
                Además hay {outs.length} salidas de participaciones del extracto ({fmt(-outs.reduce((s, l) => s + l.qty, 0), 4)} particip.: comisiones de gestión o ventas), que se mantienen.
              </small>
            )}
          </div>

          {sum.qty > 0 && (
            <div className="pf-sum">
              <span><small>Participaciones</small><b>{fmt(sum.qty)}</b></span>
              <span><small>Precio medio</small><b>{eur(sum.avg, 4)}</b></span>
              <span><small>Sin comisiones</small><b>{eur(sum.avgGross, 4)}</b></span>
              <span><small>Invertido</small><b>{eur(sum.cost)}</b></span>
            </div>
          )}
          {error && <p className="neg" style={{ margin: 0, fontSize: 13 }}>{error}</p>}
          <button className="btn primary" onClick={save}>Guardar</button>
          {holding && (
            <button className="btn sm ghost danger" style={{ justifySelf: 'end' }} onClick={() => confirm(`¿Quitar ${holding.name} de la cartera?`) && onDelete(holding.id)}>
              <Trash2 size={13} /> Quitar posición
            </button>
          )}
          <small className="faint">Clave de cotización: {quoteKey(draft) || '—'}. Con el ISIN el precio sale de LS Exchange (precio de compra, como Trade Republic). Si eliges un símbolo, se usa Yahoo Finance, salvo un ticker americano con ISIN US…, que se ignora.</small>
        </div>
      </div>
    </div>
  )
}
