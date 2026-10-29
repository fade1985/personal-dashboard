import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Bell, BellRing, CalendarClock, ExternalLink, Joystick, Plus, RefreshCw, Search, Sparkles, Star, Trash2, Trophy, X } from 'lucide-react'
import { SECTION_COLOR, go } from '../lib/nav'
import { Card, CardTitle, CountUp } from '../components/ui'
import {
  RELEASE_COLOR, STATUS_META, cover, daysUntil, fetchGame, isUpcoming, rawgEnabled, searchGames, todayYmd, upcomingReleases, useGames,
  useReleaseWatcher, type Game, type GameInfo, type GameStatus,
} from '../lib/games'

const C = SECTION_COLOR.games
type Tab = 'upcoming' | GameStatus | 'all'

const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(d + 'T12:00').toLocaleDateString('es-ES', opts)

/** "Hoy", "Mañana", "en 12 días", "en 3 meses"… */
export function countdown(date: string) {
  const n = daysUntil(date)
  if (n <= 0) return n === 0 ? '¡Hoy!' : 'Ya disponible'
  if (n === 1) return 'Mañana'
  if (n < 60) return `en ${n} días`
  return `en ${Math.round(n / 30.4)} meses`
}

function releaseLabel(g: Pick<Game, 'released' | 'tba'>) {
  if (g.tba || !g.released) return 'Fecha por anunciar'
  return isUpcoming(g as Game) ? `Sale el ${fmtDate(g.released, { day: 'numeric', month: 'long', year: 'numeric' })}` : fmtDate(g.released, { year: 'numeric' })
}

function addFromInfo(list: Game[], info: GameInfo, status: GameStatus): Game[] {
  const id = info.rawgId ? `rawg-${info.rawgId}` : crypto.randomUUID()
  const prev = list.find((g) => g.id === id)
  const upcoming = isUpcoming({ ...info, status } as Game)
  const game: Game = {
    ...prev,
    ...info,
    id,
    status,
    addedAt: prev?.addedAt ?? new Date().toISOString(),
    waiting: upcoming || prev?.waiting,
    finishedAt: status === 'done' ? prev?.finishedAt ?? todayYmd() : prev?.finishedAt,
  }
  return prev ? list.map((g) => (g.id === id ? game : g)) : [game, ...list]
}

export default function Games() {
  const [games, setGames] = useGames()
  const [tab, setTab] = useState<Tab>(() => (games.some((g) => isUpcoming(g) && g.status === 'backlog') ? 'upcoming' : 'backlog'))
  const [open, setOpen] = useState<Game | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [perm, setPerm] = useState(() => (typeof Notification === 'undefined' ? 'denied' : Notification.permission))

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const today = todayYmd()
  const year = new Date().getFullYear()
  const active = games.filter((g) => g.status !== 'done' && g.status !== 'dropped')
  const upcoming = active.filter((g) => isUpcoming(g, today)).sort((a, b) => (a.tba || !a.released ? 1 : 0) - (b.tba || !b.released ? 1 : 0) || (a.released ?? '').localeCompare(b.released ?? ''))
  const playing = games.filter((g) => g.status === 'playing')
  const done = games.filter((g) => g.status === 'done')
  const doneThisYear = done.filter((g) => g.finishedAt?.startsWith(String(year))).length
  const pending = games.filter((g) => g.status === 'backlog' && !isUpcoming(g, today)).length
  const count = (t: Tab) => (t === 'upcoming' ? upcoming.length : t === 'all' ? games.length : games.filter((g) => g.status === t).length)

  const list = useMemo(() => {
    let l = tab === 'upcoming' ? upcoming : tab === 'all' ? games : games.filter((g) => g.status === tab)
    if (tab === 'backlog') l = l.filter((g) => !isUpcoming(g, today))
    if (tab === 'done') l = [...l].sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
    return l
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, tab])

  const add = (info: GameInfo, status: GameStatus) => {
    setGames((l) => addFromInfo(l, info, status))
    const up = isUpcoming({ ...info, status } as Game)
    setTab(up ? 'upcoming' : status)
    setToast(up ? `📅 ${info.name} apuntado: te aviso cuando salga` : `${STATUS_META[status].emoji} ${info.name} → ${STATUS_META[status].label}`)
  }

  const askNotifications = () => Notification.requestPermission().then(setPerm)

  // Pasados agrupados por año
  const groups = useMemo(() => {
    if (tab !== 'done') return [{ key: '', items: list }]
    const by = new Map<string, Game[]>()
    for (const g of list) {
      const k = g.finishedAt?.slice(0, 4) ?? 'Sin fecha'
      by.set(k, [...(by.get(k) ?? []), g])
    }
    return [...by.entries()].map(([key, items]) => ({ key, items }))
  }, [list, tab])

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow" style={{ '--c': C } as CSSProperties}><Joystick size={13} /> Videojuegos</div>
          <h1>Juegos</h1>
          <p>{games.length ? `${done.length} pasados · ${playing.length} jugando · ${pending} pendientes · ${upcoming.length} por salir` : 'Apunta los juegos que te has pasado y los que quieres jugar'}</p>
        </div>
        {perm !== 'granted' && typeof Notification !== 'undefined' && (
          <button className="btn" onClick={askNotifications} disabled={perm === 'denied'} title={perm === 'denied' ? 'Notificaciones bloqueadas en el navegador' : ''}>
            <Bell size={15} /> Avisarme también con notificación
          </button>
        )}
      </div>

      <ReleaseAlerts />

      <div className="bento" style={{ marginBottom: 18 }}>
        <Card className="span-8 games-hero" i={0} accent={C} style={{ overflow: 'visible', zIndex: 3 }}>
          <GameSearch onAdd={add} owned={games} />
          <div className="stat-tiles">
            <button className="stat-tile" style={{ '--c': STATUS_META.done.color } as CSSProperties} onClick={() => setTab('done')}>
              <div className="v"><CountUp value={doneThisYear} /></div>
              <div className="l"><Trophy size={12} /> pasados en {year}</div>
            </button>
            <button className="stat-tile" style={{ '--c': STATUS_META.playing.color } as CSSProperties} onClick={() => setTab('playing')}>
              <div className="v"><CountUp value={playing.length} /></div>
              <div className="l">🕹️ jugando</div>
            </button>
            <button className="stat-tile" style={{ '--c': STATUS_META.backlog.color } as CSSProperties} onClick={() => setTab('backlog')}>
              <div className="v"><CountUp value={pending} /></div>
              <div className="l">🎯 pendientes</div>
            </button>
            <button className="stat-tile" style={{ '--c': RELEASE_COLOR } as CSSProperties} onClick={() => setTab('upcoming')}>
              <div className="v"><CountUp value={upcoming.length} /></div>
              <div className="l"><CalendarClock size={12} /> por salir</div>
            </button>
          </div>
        </Card>

        <Card className="span-4" i={1} accent={RELEASE_COLOR} style={{ height: '100%' }}>
          <CardTitle icon={<CalendarClock size={16} />} color={RELEASE_COLOR} title="Próximos lanzamientos"
            right={<button className="btn sm ghost" onClick={() => go('calendar')}>Calendario</button>} />
          {upcoming.length === 0 ? (
            <div className="empty" style={{ padding: '14px 0' }}><div className="big">🗓️</div><p>Busca un juego que aún no haya salido y te aviso el día que salga</p></div>
          ) : (
            <div className="release-list">
              {upcoming.slice(0, 5).map((g) => (
                <button key={g.id} className="release-row" onClick={() => setOpen(g)}>
                  {g.image ? <img src={cover(g.image)} alt="" loading="lazy" /> : <span className="release-noimg">🎮</span>}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="tl-title">{g.name}</div>
                    <div className="tl-sub">{g.released && !g.tba ? fmtDate(g.released) : 'Por anunciar'}</div>
                  </div>
                  <span className="release-count">{g.released && !g.tba ? countdown(g.released) : 'TBA'}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="games-toolbar">
        <div className="chips">
          {(['upcoming', 'backlog', 'playing', 'done', 'dropped', 'all'] as Tab[]).map((t) => (
            <button key={t} className={`chip ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'upcoming' ? '📅 Por salir' : t === 'all' ? 'Todos' : `${STATUS_META[t].emoji} ${STATUS_META[t].label}`}
              <span className="chip-n">{t === 'backlog' ? pending : count(t)}</span>
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty" style={{ padding: '40px 0' }}>
          <div className="big">{tab === 'done' ? '🏆' : tab === 'upcoming' ? '📅' : '🎮'}</div>
          <p>{games.length ? 'Nada en esta lista' : 'Usa el buscador de arriba para añadir tu primer juego'}</p>
        </div>
      ) : (
        groups.map((gr) => (
          <div key={gr.key}>
            {gr.key && <div className="section-title"><h2>{gr.key} <span className="faint" style={{ fontWeight: 400, fontSize: 15 }}>· {gr.items.length}</span></h2></div>}
            <div className="game-grid">
              {gr.items.map((g, k) => <GameCard key={g.id} g={g} i={k} onClick={() => setOpen(g)} />)}
            </div>
          </div>
        ))
      )}

      {rawgEnabled && <Discover owned={games} onAdd={add} />}

      {open && (
        <GameModal
          game={games.find((g) => g.id === open.id) ?? open}
          onClose={() => setOpen(null)}
          onChange={(g) => setGames((l) => l.map((x) => (x.id === g.id ? g : x)))}
          onDelete={(id) => { setGames((l) => l.filter((x) => x.id !== id)); setOpen(null) }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  )
}

/** Aviso de juegos que esperabas y ya han salido (también se muestra en Inicio). */
export function ReleaseAlerts() {
  const { released, dismiss } = useReleaseWatcher()
  const [, setGames] = useGames()
  if (!released.length) return null
  return (
    <div className="release-alerts">
      {released.map((g) => (
        <div key={g.id} className="release-alert" style={{ backgroundImage: g.image ? `linear-gradient(90deg, rgba(10,8,20,.95) 35%, rgba(10,8,20,.55)), url(${cover(g.image)})` : undefined }}>
          <BellRing size={20} className="ring-bell" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>¡Ya ha salido {g.name}!</b>
            <div className="muted" style={{ fontSize: 13 }}>{g.released ? `Disponible desde el ${fmtDate(g.released, { day: 'numeric', month: 'long' })}` : 'Ya disponible'}</div>
          </div>
          <button className="btn sm" onClick={() => setGames((l) => l.map((x) => (x.id === g.id ? { ...x, status: 'playing', waiting: false } : x)))}>🕹️ A jugar</button>
          <button className="icon-btn" onClick={() => dismiss(g.id)} title="Entendido"><X size={15} /></button>
        </div>
      ))}
    </div>
  )
}

function GameSearch({ onAdd, owned }: { onAdd: (g: GameInfo, s: GameStatus) => void; owned: Game[] }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<GameInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focus, setFocus] = useState(false)
  const [manualDate, setManualDate] = useState('')
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!rawgEnabled || q.trim().length < 2) { setResults([]); return }
    let alive = true
    const t = setTimeout(() => {
      setLoading(true)
      setError(null)
      searchGames(q.trim())
        .then((r) => alive && setResults(r))
        .catch((e) => alive && setError((e as Error).message))
        .finally(() => alive && setLoading(false))
    }, 350)
    return () => { alive = false; clearTimeout(t) }
  }, [q])

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setFocus(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const pick = (info: GameInfo, s: GameStatus) => {
    onAdd(info, s)
    setQ('')
    setManualDate('')
    setFocus(false)
  }
  const ownedStatus = (info: GameInfo) => owned.find((g) => g.rawgId && g.rawgId === info.rawgId)?.status

  return (
    <div className="game-search" ref={box}>
      <div className="fin-search" style={{ flex: 1 }}>
        <Search size={17} />
        <input
          className="input big" placeholder={rawgEnabled ? 'Busca un juego para añadirlo… (p. ej. Zelda, Hollow Knight Silksong)' : 'Nombre del juego…'}
          value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)}
        />
        {loading && <RefreshCw size={15} className="spin search-spin" />}
      </div>
      {focus && q.trim().length >= 2 && (
        <div className="game-results">
          {error && <div className="error" style={{ margin: 8 }}>{error}</div>}
          {results.map((r) => {
            const st = ownedStatus(r)
            const up = isUpcoming({ ...r } as Game)
            return (
              <div key={r.rawgId} className="game-result">
                <img src={cover(r.image)} alt="" loading="lazy" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="tl-title">{r.name}</div>
                  <div className="tl-sub">
                    {up ? <span style={{ color: RELEASE_COLOR, fontWeight: 600 }}>{releaseLabel(r)}</span> : r.released?.slice(0, 4)}
                    {r.platforms?.length ? ` · ${r.platforms.slice(0, 3).join(', ')}${r.platforms.length > 3 ? '…' : ''}` : ''}
                  </div>
                </div>
                {st ? <span className="pill" style={{ background: STATUS_META[st].color + '22', color: STATUS_META[st].color }}>{STATUS_META[st].emoji} {STATUS_META[st].label}</span> : (
                  <div className="row" style={{ gap: 6 }}>
                    <button className="btn sm" onClick={() => pick(r, 'backlog')} title={up ? 'Te aviso cuando salga' : 'Lo quiero jugar'}>{up ? '🔔 Avisarme' : '🎯 Quiero'}</button>
                    {!up && <button className="btn sm" onClick={() => pick(r, 'playing')}>🕹️</button>}
                    {!up && <button className="btn sm" onClick={() => pick(r, 'done')} title="Ya me lo he pasado">🏆</button>}
                  </div>
                )}
              </div>
            )
          })}
          {!loading && rawgEnabled && !results.length && !error && <div className="faint" style={{ padding: '12px 14px', fontSize: 13 }}>Sin resultados en RAWG</div>}
          <div className="game-result manual">
            <Plus size={16} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>Añadir «{q.trim()}» a mano</div>
            <input className="input" type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} title="Fecha de salida (opcional)" style={{ width: 150, padding: '5px 8px' }} />
            <button className="btn sm" onClick={() => pick({ name: q.trim(), released: manualDate || undefined, tba: !manualDate || undefined }, 'backlog')}>🎯</button>
            <button className="btn sm" onClick={() => pick({ name: q.trim(), released: manualDate || undefined }, 'done')}>🏆</button>
          </div>
        </div>
      )}
      {!rawgEnabled && (
        <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
          Añade <code>RAWG_KEY</code> en <code>.env.local</code> para buscar juegos con portada y fechas de lanzamiento automáticas (pasos en el README).
        </div>
      )}
    </div>
  )
}

function GameCard({ g, i, onClick }: { g: Game; i: number; onClick: () => void }) {
  const up = isUpcoming(g)
  const st = STATUS_META[g.status]
  return (
    <button className={`game-card ${up ? 'upcoming' : ''}`} style={{ '--i': Math.min(i, 20), '--c': st.color } as CSSProperties} onClick={onClick}>
      <div className="game-cover">
        {g.image ? <img src={cover(g.image)} alt="" loading="lazy" /> : <div className="game-noimg">🎮</div>}
        {up ? (
          <span className="game-badge release">{g.released && !g.tba ? countdown(g.released) : 'Por anunciar'}</span>
        ) : (
          <span className="game-badge">{st.emoji} {st.label}</span>
        )}
        {g.metacritic && <span className="game-meta">{g.metacritic}</span>}
      </div>
      <div className="game-info">
        <div className="game-name">{g.name}</div>
        <div className="game-sub">
          {g.status === 'done' && g.finishedAt ? `Pasado el ${fmtDate(g.finishedAt, { day: 'numeric', month: 'short' })}` : up ? releaseLabel(g) : g.released?.slice(0, 4)}
          {g.myPlatform && ` · ${g.myPlatform}`}
        </div>
        {g.rating ? <div className="stars">{'★'.repeat(g.rating)}<span>{'★'.repeat(5 - g.rating)}</span></div> : null}
      </div>
    </button>
  )
}

function Discover({ owned, onAdd }: { owned: Game[]; onAdd: (g: GameInfo, s: GameStatus) => void }) {
  const [items, setItems] = useState<GameInfo[] | null>(null)
  useEffect(() => { upcomingReleases().then(setItems).catch(() => setItems([])) }, [])
  if (!items?.length) return null
  const has = new Set(owned.map((g) => g.rawgId))
  return (
    <Card i={2} accent={RELEASE_COLOR} style={{ marginTop: 24 }}>
      <CardTitle icon={<Sparkles size={16} />} color={RELEASE_COLOR} title="Lanzamientos destacados de los próximos meses" />
      <div className="discover-row">
        {items.map((r) => (
          <div key={r.rawgId} className="discover-item">
            <div className="game-cover">
              {r.image ? <img src={cover(r.image)} alt="" loading="lazy" /> : <div className="game-noimg">🎮</div>}
              <span className="game-badge release">{r.released ? countdown(r.released) : 'Por anunciar'}</span>
            </div>
            <div className="game-name" style={{ margin: '8px 0 2px' }}>{r.name}</div>
            <div className="game-sub">{r.released ? fmtDate(r.released) : 'Por anunciar'}</div>
            <button className="btn sm" style={{ marginTop: 8, width: '100%', justifyContent: 'center' }} disabled={has.has(r.rawgId)} onClick={() => onAdd(r, 'backlog')}>
              {has.has(r.rawgId) ? '✓ Apuntado' : '🔔 Avisarme'}
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}

function GameModal({ game: g, onClose, onChange, onDelete }: { game: Game; onClose: () => void; onChange: (g: Game) => void; onDelete: (id: string) => void }) {
  const [refreshing, setRefreshing] = useState(false)
  const set = (patch: Partial<Game>) => onChange({ ...g, ...patch })
  const up = isUpcoming(g)

  const refresh = () => {
    if (!g.rawgId) return
    setRefreshing(true)
    fetchGame(g.rawgId).then((f) => set({ released: f.released, tba: f.tba, image: f.image ?? g.image, platforms: f.platforms, genres: f.genres, metacritic: f.metacritic })).finally(() => setRefreshing(false))
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal single wide game-modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn modal-close" onClick={onClose}><X size={18} /></button>
        <div className="game-modal-cover" style={g.image ? { backgroundImage: `url(${cover(g.image)})` } : { minHeight: 130 }}>
          <div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              {up && <span className="game-badge release" style={{ position: 'static' }}>{g.released && !g.tba ? countdown(g.released) : 'Por anunciar'}</span>}
              {g.genres?.slice(0, 3).map((x) => <span key={x} className="pill">{x}</span>)}
              {g.metacritic && <span className="pill" style={{ color: '#4ade80' }}>Metacritic {g.metacritic}</span>}
            </div>
            <h2>{g.name}</h2>
            <div className="muted" style={{ fontSize: 13 }}>{releaseLabel(g)}{g.platforms?.length ? ` · ${g.platforms.join(', ')}` : ''}</div>
          </div>
        </div>

        <div className="game-modal-body">
          <div className="seg" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {(Object.keys(STATUS_META) as GameStatus[]).map((s) => (
              <button key={s} className={g.status === s ? 'active' : ''} onClick={() => set({ status: s, finishedAt: s === 'done' ? g.finishedAt ?? todayYmd() : g.finishedAt })}>
                {STATUS_META[s].emoji} {STATUS_META[s].label}
              </button>
            ))}
          </div>

          <div className="import-grid" style={{ marginTop: 14 }}>
            <label className="field">
              <span>Mi plataforma</span>
              <input className="input" list="game-platforms" value={g.myPlatform ?? ''} onChange={(e) => set({ myPlatform: e.target.value || undefined })} placeholder="Switch, PS5, PC…" />
              <datalist id="game-platforms">{(g.platforms ?? ['Nintendo Switch', 'PlayStation 5', 'PC', 'Xbox Series S/X']).map((p) => <option key={p} value={p} />)}</datalist>
            </label>
            {!g.rawgId && (
              <label className="field">
                <span>Fecha de salida</span>
                <input className="input" type="date" value={g.released ?? ''} onChange={(e) => set({ released: e.target.value || undefined, tba: !e.target.value || undefined, waiting: Boolean(e.target.value && e.target.value > todayYmd()) || g.waiting })} />
              </label>
            )}
            {g.status === 'done' && (
              <label className="field">
                <span>Me lo pasé el</span>
                <input className="input" type="date" value={g.finishedAt ?? ''} onChange={(e) => set({ finishedAt: e.target.value || undefined })} />
              </label>
            )}
            {(g.status === 'done' || g.status === 'playing' || g.status === 'dropped') && (
              <label className="field">
                <span>Horas</span>
                <input className="input" type="number" min={0} value={g.hours ?? ''} onChange={(e) => set({ hours: e.target.value ? Number(e.target.value) : undefined })} />
              </label>
            )}
          </div>

          {(g.status === 'done' || g.status === 'dropped') && (
            <div className="field" style={{ marginTop: 14 }}>
              <span>Mi nota</span>
              <div className="star-input">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className={n <= (g.rating ?? 0) ? 'on' : ''} onClick={() => set({ rating: g.rating === n ? undefined : n })}><Star size={22} /></button>
                ))}
              </div>
            </div>
          )}

          <label className="field" style={{ marginTop: 14 }}>
            <span>Notas</span>
            <textarea className="input" rows={3} value={g.notes ?? ''} onChange={(e) => set({ notes: e.target.value || undefined })} placeholder="Qué te pareció, dónde te quedaste, con quién jugarlo…" />
          </label>

          <div className="row" style={{ justifyContent: 'space-between', marginTop: 18, flexWrap: 'wrap', gap: 8 }}>
            <div className="row" style={{ gap: 8 }}>
              {g.rawgId && <button className="btn sm ghost" onClick={refresh}><RefreshCw size={13} className={refreshing ? 'spin' : ''} /> Actualizar datos</button>}
              {g.slug && <a className="btn sm ghost" href={`https://rawg.io/games/${g.slug}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> RAWG</a>}
            </div>
            <button className="btn sm ghost danger" onClick={() => confirm(`¿Quitar ${g.name} de tu lista?`) && onDelete(g.id)}><Trash2 size={13} /> Quitar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
