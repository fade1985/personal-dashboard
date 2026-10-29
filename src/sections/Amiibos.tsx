import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Check, Download, Gamepad2, Heart, Package, RefreshCw, Search, Trophy, Upload, X } from 'lucide-react'
import { Card, CardTitle, CountUp, Ring } from '../components/ui'
import { SECTION_COLOR } from '../lib/nav'
import { loadCatalog, type Amiibo, type Collection, type OwnedInfo, type Status } from '../lib/amiibo'
import { usePersistentState } from '../lib/storage'

// ---------- Estado compartido ----------

let catalogPromise: Promise<Amiibo[]> | null = null

export function useAmiiboCollection() {
  const [catalog, setCatalog] = useState<Amiibo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collection, setCollection] = usePersistentState<Collection>('amiibo-collection', {})

  const load = (force = false) => {
    if (force || !catalogPromise) catalogPromise = loadCatalog(force)
    setLoading(true)
    setError(null)
    catalogPromise
      .then(setCatalog)
      .catch((e) => {
        catalogPromise = null
        setError(e.message)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => load(), [])

  const setStatus = (id: string, status: Status | null) =>
    setCollection((c) => {
      const next = { ...c }
      if (!status) delete next[id]
      else next[id] = { ...c[id], status, addedAt: c[id]?.status === status ? c[id].addedAt : new Date().toISOString() }
      return next
    })

  const patch = (id: string, p: Partial<OwnedInfo>) =>
    setCollection((c) => (c[id] ? { ...c, [id]: { ...c[id], ...p } } : c))

  return { catalog, loading, error, reload: () => load(true), collection, setCollection, setStatus, patch }
}

// ---------- Sección ----------

type TypeFilter = 'Figure' | 'Card' | 'all'
type StatusFilter = 'all' | 'owned' | 'missing' | 'wishlist'
type Sort = 'release' | 'name' | 'series'

const TYPE_LABEL: Record<TypeFilter, string> = { Figure: 'Figuras', Card: 'Tarjetas', all: 'Todo' }
const STATUS_LABEL: Record<StatusFilter, string> = { all: 'Todos', owned: '✓ Los tengo', missing: 'Me faltan', wishlist: '♥ Deseados' }
const PAGE = 60

export default function Amiibos() {
  const am = useAmiiboCollection()
  const { catalog, collection } = am
  const [q, setQ] = usePersistentState('am-q', '')
  const [type, setType] = usePersistentState<TypeFilter>('am-type', 'Figure')
  const [status, setStatusF] = usePersistentState<StatusFilter>('am-status', 'all')
  const [series, setSeries] = usePersistentState('am-series', '')
  const [sort, setSort] = usePersistentState<Sort>('am-sort', 'release')
  const [limit, setLimit] = useState(PAGE)
  const [detail, setDetail] = useState<Amiibo | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const ofType = useMemo(() => (type === 'all' ? catalog : catalog.filter((a) => a.type === type)), [catalog, type])

  const seriesStats = useMemo(() => {
    const m = new Map<string, { total: number; owned: number }>()
    for (const a of ofType) {
      const s = m.get(a.series) ?? { total: 0, owned: 0 }
      s.total++
      if (collection[a.id]?.status === 'owned') s.owned++
      m.set(a.series, s)
    }
    return [...m.entries()].sort((a, b) => b[1].owned / b[1].total - a[1].owned / a[1].total || b[1].total - a[1].total)
  }, [ofType, collection])

  const ownedCount = ofType.filter((a) => collection[a.id]?.status === 'owned').length
  const wishCount = ofType.filter((a) => collection[a.id]?.status === 'wishlist').length

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = ofType.filter((a) => {
      const st = collection[a.id]?.status
      if (status === 'owned' && st !== 'owned') return false
      if (status === 'missing' && st === 'owned') return false
      if (status === 'wishlist' && st !== 'wishlist') return false
      if (series && a.series !== series) return false
      if (needle && !`${a.name} ${a.character} ${a.series} ${a.gameSeries}`.toLowerCase().includes(needle)) return false
      return true
    })
    const cmp: Record<Sort, (a: Amiibo, b: Amiibo) => number> = {
      release: (a, b) => (b.release ?? '').localeCompare(a.release ?? ''),
      name: (a, b) => a.name.localeCompare(b.name),
      series: (a, b) => a.series.localeCompare(b.series) || (a.release ?? '').localeCompare(b.release ?? ''),
    }
    return list.sort(cmp[sort])
  }, [ofType, collection, q, status, series, sort])

  useEffect(() => setLimit(PAGE), [q, type, status, series, sort])

  // Scroll infinito
  const sentinel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setLimit((l) => l + PAGE), { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [filtered.length])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), collection }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `amiibos-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const importJson = (file: File) => {
    file.text().then((t) => {
      try {
        const j = JSON.parse(t)
        const incoming: Collection = j.collection ?? j
        am.setCollection((c) => ({ ...c, ...incoming }))
        flash(`Importados ${Object.keys(incoming).length} amiibos`)
      } catch {
        flash('Archivo no válido')
      }
    })
  }

  const pct = ofType.length ? ownedCount / ofType.length : 0
  const ownedInfos = ofType.map((a) => collection[a.id]).filter((c) => c?.status === 'owned')
  const boxedCount = ownedInfos.filter((c) => c.boxed).length
  const spent = Math.round(ownedInfos.reduce((sum, c) => sum + (c.price ?? 0), 0))

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ '--c': SECTION_COLOR.amiibos } as CSSProperties}><Gamepad2 size={13} /> Colección</div>
          <h1>Mis amiibos</h1>
          <p>{catalog.length ? `${catalog.length} amiibos en el catálogo` : 'Cargando catálogo…'}</p>
        </div>
        <div className="row">
          <button className="btn sm" onClick={exportJson}><Download size={14} /> Exportar</button>
          <label className="btn sm" style={{ cursor: 'pointer' }}>
            <Upload size={14} /> Importar
            <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
          </label>
          <button className="icon-btn" onClick={am.reload} title="Actualizar catálogo">
            <RefreshCw size={14} className={am.loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {am.error && <div className="error" style={{ marginBottom: 16 }}>No se pudo cargar el catálogo: {am.error}</div>}

      <div className="grid">
        <Card className="am-hero" i={0} accent={SECTION_COLOR.amiibos}>
          <Ring pct={pct} size={170} stroke={14} colors={['#fb7185', '#a78bfa']}>
            <div>
              <b><CountUp value={ownedCount} /></b>
              <span className="muted" style={{ fontSize: 12 }}>de {ofType.length} {TYPE_LABEL[type].toLowerCase()}</span>
            </div>
          </Ring>
          <div style={{ minWidth: 0, width: '100%' }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 600, letterSpacing: '-.02em' }}>
              {pct === 0 ? 'Empieza tu colección ✨' : pct < 0.25 ? 'Buen comienzo 💪' : pct < 0.5 ? 'La colección crece 🚀' : pct < 1 ? '¡Ya casi la tienes! 🔥' : '¡Colección completa! 🏆'}
            </div>
            <div className="muted" style={{ fontSize: 13.5 }}>Has completado el {Math.round(pct * 100)}% · {seriesStats.filter(([, s]) => s.owned === s.total).length} series completas</div>
            <div className="stat-tiles">
              <div className="stat-tile" style={{ '--c': 'var(--green)' } as CSSProperties}>
                <div className="v"><CountUp value={ownedCount} /></div><div className="l"><Check size={12} /> los tengo</div>
              </div>
              <div className="stat-tile">
                <div className="v"><CountUp value={ofType.length - ownedCount} /></div><div className="l">me faltan</div>
              </div>
              <div className="stat-tile" style={{ '--c': 'var(--pink)' } as CSSProperties}>
                <div className="v"><CountUp value={wishCount} /></div><div className="l"><Heart size={12} /> deseados</div>
              </div>
              <div className="stat-tile" style={{ '--c': 'var(--amber)' } as CSSProperties}>
                <div className="v"><CountUp value={boxedCount} /></div><div className="l"><Package size={12} /> en caja</div>
              </div>
              <div className="stat-tile" style={{ '--c': 'var(--cyan)' } as CSSProperties}>
                <div className="v"><CountUp value={spent} /> €</div><div className="l">invertido</div>
              </div>
            </div>
          </div>
        </Card>
        <Card i={1} accent={SECTION_COLOR.amiibos}>
          <CardTitle
            icon={<Trophy size={16} />} color="#fbbf24" title="Progreso por serie"
            right={series && <button className="btn sm ghost" onClick={() => setSeries('')}><X size={13} /> Quitar filtro</button>}
          />
          <div className="series-list">
            {seriesStats.map(([name, s]) => (
              <button key={name} className={`series-row ${series === name ? 'active' : ''} ${s.owned === s.total ? 'done' : ''}`} onClick={() => setSeries(series === name ? '' : name)}>
                <div className="row">
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span className="muted" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{s.owned}/{s.total}{s.owned === s.total && ' 🏆'}</span>
                </div>
                <div className="progress"><div style={{ width: `${(s.owned / s.total) * 100}%` }} /></div>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="am-toolbar">
        <div className="row" style={{ position: 'relative', flex: '1 1 150px' }}>
          <Search size={16} style={{ position: 'absolute', left: 11 }} className="muted" />
          <input className="input" placeholder="Buscar personaje, serie…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 34, width: '100%' }} />
        </div>
        <div className="chips">
          {(Object.keys(TYPE_LABEL) as TypeFilter[]).map((t) => (
            <button key={t} className={`chip ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>{TYPE_LABEL[t]}</button>
          ))}
        </div>
        <div className="chips">
          {(Object.keys(STATUS_LABEL) as StatusFilter[]).map((s) => (
            <button key={s} className={`chip ${status === s ? 'active' : ''}`} onClick={() => setStatusF(s)}>{STATUS_LABEL[s]}</button>
          ))}
        </div>
        <select className="input" value={series} onChange={(e) => setSeries(e.target.value)} style={{ maxWidth: 170 }}>
          <option value="">Todas las series</option>
          {[...new Set(ofType.map((a) => a.series))].sort().map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="release">Más recientes</option>
          <option value="name">Nombre</option>
          <option value="series">Serie</option>
        </select>
      </div>

      <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>{filtered.length} resultados</div>

      {am.loading && !catalog.length ? (
        <div className="am-grid">
          {Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton" style={{ height: 220 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty card"><div className="big">🔍</div>No hay amiibos con esos filtros</div>
      ) : (
        <div className="am-grid">
          {filtered.slice(0, limit).map((a, idx) => (
            <AmiiboCard
              key={a.id}
              i={idx % PAGE}
              a={a}
              info={collection[a.id]}
              onOpen={() => setDetail(a)}
              onToggle={(s, ev) => {
                const cur = collection[a.id]?.status
                am.setStatus(a.id, cur === s ? null : s)
                if (s === 'owned' && cur !== 'owned') {
                  confetti(ev.clientX, ev.clientY)
                  flash(`¡${a.name} añadido a tu colección! 🎉`)
                }
              }}
            />
          ))}
        </div>
      )}
      <div ref={sentinel} style={{ height: 1 }} />

      {detail && <AmiiboDetail a={detail} info={collection[detail.id]} am={am} onClose={() => setDetail(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}

function AmiiboCard({ a, info, i, onOpen, onToggle }: {
  a: Amiibo; info?: OwnedInfo; i: number; onOpen: () => void; onToggle: (s: Status, ev: React.MouseEvent) => void
}) {
  const owned = info?.status === 'owned'
  const wish = info?.status === 'wishlist'
  const [bump, setBump] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  // Inclinación 3D + posición del brillo holográfico según el ratón
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current!
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    el.style.setProperty('--ry', `${(x - 0.5) * 14}deg`)
    el.style.setProperty('--rx', `${(0.5 - y) * 14}deg`)
    el.style.setProperty('--hx', `${x * 100}%`)
    el.style.setProperty('--hy', `${y * 100}%`)
  }
  const onLeave = () => {
    ref.current!.style.setProperty('--rx', '0deg')
    ref.current!.style.setProperty('--ry', '0deg')
  }

  return (
    <div
      ref={ref}
      className={`am-card ${owned ? 'owned' : ''} ${wish ? 'wish' : ''}`}
      style={{ '--i': i } as CSSProperties}
      onClick={onOpen}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      <div className="am-badges">
        {owned && <span className="am-badge" style={{ background: 'var(--green)' }}><Check size={13} color="#0b0d17" strokeWidth={3} /></span>}
        {wish && <span className="am-badge" style={{ background: 'var(--pink)' }}><Heart size={12} color="#fff" fill="#fff" /></span>}
        {info?.boxed && <span className="am-badge" style={{ background: 'var(--amber)' }} title="En caja"><Package size={12} color="#0b0d17" /></span>}
      </div>
      <div className="img">
        <img key={bump} className={bump ? 'pop' : ''} src={a.image} alt={a.name} loading="lazy" />
      </div>
      <div>
        <div className="am-name">{a.name}</div>
        <div className="am-series">{a.series}</div>
      </div>
      <div className="am-actions" onClick={(e) => e.stopPropagation()}>
        <button className={owned ? 'on-owned' : ''} onClick={(e) => { onToggle('owned', e); setBump((b) => b + 1) }}>
          <Check size={13} /> {owned ? 'Lo tengo' : 'Tengo'}
        </button>
        {!owned && (
          <button className={wish ? 'on-wish' : ''} onClick={(e) => onToggle('wishlist', e)} title="Lista de deseos" style={{ flex: '0 0 36px' }}>
            <Heart size={13} fill={wish ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
    </div>
  )
}

function AmiiboDetail({ a, info, am, onClose }: { a: Amiibo; info?: OwnedInfo; am: ReturnType<typeof useAmiiboCollection>; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  const owned = info?.status === 'owned'
  const fmt = (d?: string) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '—')

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className={`modal-figure ${owned ? 'owned' : ''}`}>
          <img src={a.image} alt={a.name} style={{ filter: owned ? undefined : 'grayscale(.6) drop-shadow(0 20px 20px rgba(0,0,0,.6))' }} />
        </div>
        <div className="grid" style={{ gap: 14, alignContent: 'start' }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ margin: 0 }}>{a.name}</h2>
              <div className="muted">{a.series}</div>
            </div>
            <div className="spacer" />
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
          <dl className="kv">
            <dt>Personaje</dt><dd>{a.character}</dd>
            <dt>Juego</dt><dd>{a.gameSeries}</dd>
            <dt>Tipo</dt><dd>{a.type}</dd>
            <dt>Lanzamiento EU</dt><dd>{fmt(a.releaseEU)}</dd>
            {info && <><dt>{owned ? 'En colección desde' : 'Deseado desde'}</dt><dd>{fmt(info.addedAt)}</dd></>}
          </dl>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className={`btn ${owned ? 'primary' : ''}`} onClick={() => am.setStatus(a.id, owned ? null : 'owned')}>
              <Check size={15} /> {owned ? 'En mi colección' : 'Lo tengo'}
            </button>
            {!owned && (
              <button className="btn" style={info?.status === 'wishlist' ? { background: 'rgba(244,114,182,.22)', borderColor: 'var(--pink)' } : undefined}
                onClick={() => am.setStatus(a.id, info?.status === 'wishlist' ? null : 'wishlist')}>
                <Heart size={15} /> {info?.status === 'wishlist' ? 'En deseados' : 'Lo quiero'}
              </button>
            )}
          </div>
          {owned && (
            <div className="grid" style={{ gap: 10 }}>
              <label className="row" style={{ fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={Boolean(info?.boxed)} onChange={(e) => am.patch(a.id, { boxed: e.target.checked })} />
                <Package size={15} /> Lo tengo en caja (sin abrir)
              </label>
              <div className="row">
                <input className="input" type="number" min={0} step="0.01" placeholder="Precio (€)" value={info?.price ?? ''}
                  onChange={(e) => am.patch(a.id, { price: e.target.value ? Number(e.target.value) : undefined })} style={{ width: 130 }} />
                <input className="input" placeholder="Notas (dónde lo compré, estado…)" value={info?.notes ?? ''}
                  onChange={(e) => am.patch(a.id, { notes: e.target.value })} style={{ flex: 1 }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const CONFETTI_COLORS = ['#fb7185', '#a78bfa', '#22d3ee', '#fbbf24', '#4ade80', '#f472b6']

/** Pequeña explosión de confeti en (x, y). */
function confetti(x: number, y: number) {
  for (let k = 0; k < 26; k++) {
    const el = document.createElement('span')
    el.className = 'confetti'
    const ang = Math.random() * Math.PI * 2
    const dist = 60 + Math.random() * 110
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.style.background = CONFETTI_COLORS[k % CONFETTI_COLORS.length]
    el.style.setProperty('--dx', `${Math.cos(ang) * dist}px`)
    el.style.setProperty('--dy', `${Math.sin(ang) * dist - 40}px`)
    el.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`)
    document.body.appendChild(el)
    setTimeout(() => el.remove(), 1100)
  }
}
