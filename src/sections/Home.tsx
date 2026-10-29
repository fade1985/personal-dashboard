import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowRight, CalendarDays, Cake, CloudSun, Gamepad2, Landmark, Mail as MailIcon, RefreshCw, Sparkles } from 'lucide-react'
import { SECTION_COLOR, go, useGoogleCtx } from '../lib/nav'
import { WeatherMini, hhmm } from '../components/WeatherParts'
import { Card, CardTitle, CountUp, Ring, capitalize, relTime } from '../components/ui'
import { expandLocal, kindIcon, sameDay, useEvents, useLocalEvents } from '../lib/events'
import { fetchInbox, type CalEvent, type Mail } from '../lib/google'
import { useForecast, useHere } from '../lib/useWeather'
import { MADRID, wmoIcon, type Forecast } from '../lib/weather'
import { useAmiiboCollection } from './Amiibos'
import { Money } from './Finance'
import { ReleaseAlerts } from './Games'
import { monthFlow, monthKey, netWorth, spendByCategory, useAccounts, useTxs } from '../lib/finance'

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function greeting(h: number) {
  if (h < 6) return ['Buenas noches', '🌙']
  if (h < 13) return ['Buenos días', '☀️']
  if (h < 21) return ['Buenas tardes', '🌤️']
  return ['Buenas noches', '🌙']
}

function useInbox(connected: boolean) {
  const [mails, setMails] = useState<Mail[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const load = () => {
    setLoading(true)
    setError(null)
    fetchInbox(7)
      .then((r) => {
        setMails(r.mails)
        setUnread(r.unreadCount)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    if (!connected) return
    load()
    const t = setInterval(load, 5 * 60_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected])
  return { mails, unread, loading, error, reload: load }
}

export default function Home() {
  const google = useGoogleCtx()
  const now = useClock()
  const { here } = useHere()
  const madrid = useForecast(MADRID)
  const local = useForecast(here)
  const showLocal = Boolean(here && here.name !== MADRID.name)

  const [from, to] = useMemo(() => {
    const f = new Date()
    f.setHours(0, 0, 0, 0)
    return [f, new Date(f.getTime() + 8 * 86400_000)]
  }, [])
  const { events, loading: evLoading } = useEvents(from, to, google.connected)
  const inbox = useInbox(google.connected)
  const am = useAmiiboCollection()

  // Próximo cumpleaños: locales en el próximo año + los de Google en la semana
  const [localEvents] = useLocalEvents()
  const dayKey = now.toDateString()
  const nextBirthday = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const year = expandLocal(localEvents.filter((e) => e.kind === 'birthday'), start, new Date(start.getTime() + 366 * 86400_000))
    return [...year, ...events.filter((e) => e.kind === 'birthday')].sort((a, b) => a.start.getTime() - b.start.getTime())[0]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localEvents, events, dayKey])

  const todayCount = events.filter((e) => sameDay(e.start, now) || (e.start < now && e.end > now)).length
  const owned = Object.values(am.collection).filter((c) => c.status === 'owned').length
  const [greet, emoji] = greeting(now.getHours())
  const dayPct = ((now.getHours() * 60 + now.getMinutes()) / 1440) * 100
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  return (
    <div className="bento">
      <ReleaseAlerts />
      {/* Hero */}
      <Card className="hero span-8" i={0} accent={SECTION_COLOR.home}>
        <div className="eyebrow" style={{ '--c': SECTION_COLOR.home } as CSSProperties}>
          <Sparkles size={13} /> {capitalize(now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
        </div>
        <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 18 }}>
          <div className="hero-clock">
            {now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            <span className="sec">{String(now.getSeconds()).padStart(2, '0')}</span>
          </div>
          <div style={{ paddingBottom: 6 }}>
            <div className="hero-greet">{greet} {emoji}</div>
            <div className="muted" style={{ fontSize: 13.5 }}>
              {todayCount ? `Tienes ${todayCount} ${todayCount === 1 ? 'cosa' : 'cosas'} hoy` : 'Día libre de planes'}
            </div>
          </div>
        </div>
        <div className="day-progress">
          <div className="row" style={{ justifyContent: 'space-between', fontSize: 11.5, marginBottom: 8 }}>
            <span className="faint">00:00</span>
            <span className="muted">{Math.round(dayPct)}% del día</span>
            <span className="faint">24:00</span>
          </div>
          <div className="bar">
            <div style={{ width: `${dayPct}%` }} />
            <span style={{ left: `${dayPct}%` }} />
          </div>
        </div>
        <div className="stat-tiles">
          <button className="stat-tile" style={{ '--c': SECTION_COLOR.calendar } as CSSProperties} onClick={() => go('calendar')}>
            <div className="v"><CountUp value={events.length} /></div>
            <div className="l"><CalendarDays size={12} /> eventos en 7 días</div>
          </button>
          <button className="stat-tile" style={{ '--c': SECTION_COLOR.mail } as CSSProperties} onClick={() => google.connected && window.open('https://mail.google.com', '_blank')}>
            <div className="v">{google.connected ? <CountUp value={inbox.unread} /> : '—'}</div>
            <div className="l"><MailIcon size={12} /> correos sin leer</div>
          </button>
          <button className="stat-tile" style={{ '--c': '#f472b6' } as CSSProperties} onClick={() => go('calendar')}>
            <div className="v">{nextBirthday ? capitalize(relTime(nextBirthday.start, startOfToday).replace(/^dentro de /, '')) : '—'}</div>
            <div className="l" style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              <Cake size={12} /> {nextBirthday ? nextBirthday.title.replace(/ \(\d+\)$/, '') : 'sin cumpleaños'}
            </div>
          </button>
          <button className="stat-tile" style={{ '--c': SECTION_COLOR.amiibos } as CSSProperties} onClick={() => go('amiibos')}>
            <div className="v"><CountUp value={owned} /></div>
            <div className="l"><Gamepad2 size={12} /> amiibos</div>
          </button>
        </div>
      </Card>

      <div className="span-4">
        {madrid.data ? <WeatherMini f={madrid.data} name="Madrid" i={1} onClick={() => go('weather')} /> : <div className="skeleton" style={{ height: '100%', minHeight: 250 }} />}
      </div>

      <div className="span-7"><AgendaCard events={events} loading={evLoading} /></div>
      <div className="span-5"><InboxCard inbox={inbox} /></div>

      <div className="span-8"><AmiiboCard am={am} /></div>
      <div className="span-4">
        {showLocal ? (
          local.data ? <WeatherMini f={local.data} name={here!.name} i={5} onClick={() => go('weather')} /> : <div className="skeleton" style={{ height: '100%', minHeight: 250 }} />
        ) : (
          <WeekCard f={madrid.data} />
        )}
      </div>

      <div className="span-12"><FinanceCard /></div>
    </div>
  )
}

function AgendaCard({ events, loading }: { events: CalEvent[]; loading: boolean }) {
  const google = useGoogleCtx()
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const upcoming = events.filter((e) => e.end > now).slice(0, 10)
  const nextId = upcoming.find((e) => !e.allDay && e.start > now)?.id

  const groups: { day: Date; items: CalEvent[] }[] = []
  for (const e of upcoming) {
    const d = e.start < today ? today : e.start
    const g = groups.find((x) => sameDay(x.day, d))
    if (g) g.items.push(e)
    else groups.push({ day: d, items: [e] })
  }
  const label = (d: Date) => {
    const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - today.getTime()) / 86400_000)
    if (diff <= 0) return 'Hoy'
    if (diff === 1) return 'Mañana'
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })
  }

  return (
    <Card i={2} accent={SECTION_COLOR.calendar} style={{ height: '100%' }}>
      <CardTitle
        icon={<CalendarDays size={16} />} color={SECTION_COLOR.calendar} title="Próximos 7 días"
        right={<button className="btn sm ghost" onClick={() => go('calendar')}>Calendario <ArrowRight size={14} /></button>}
      />
      {loading && !upcoming.length ? (
        <div className="skeleton" style={{ height: 220 }} />
      ) : groups.length === 0 ? (
        <div className="empty">
          <div className="big">🏝️</div>
          <p>Semana tranquila.{!google.connected && ' Conecta Google para ver tus eventos.'}</p>
          <button className="btn sm" onClick={() => go('calendar')}>Añadir algo</button>
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.day.toDateString()}>
            <div className={`tl-day ${sameDay(g.day, today) ? 'today' : ''}`}>{label(g.day)}</div>
            {g.items.map((e) => (
              <div key={e.id} className={`tl-item ${e.id === nextId ? 'next' : ''}`} style={{ '--c': e.color } as CSSProperties}>
                <div className="tl-ico">{kindIcon(e.kind) ?? <i />}</div>
                <div className="tl-main">
                  <div className="tl-title">{e.title}</div>
                  <div className="tl-sub">{e.calendar}{e.location ? ` · ${e.location}` : ''}</div>
                </div>
                <div className="tl-when">
                  <b>{e.allDay ? 'Todo el día' : hhmm(e.start)}</b>
                  {!e.allDay && e.start > now && e.start.getTime() - now.getTime() < 86400_000 && relTime(e.start, now)}
                  {!e.allDay && e.start <= now && 'Ahora'}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </Card>
  )
}

const AVATAR_COLORS = ['#a78bfa', '#22d3ee', '#f472b6', '#fbbf24', '#4ade80', '#818cf8', '#fb7185']

function InboxCard({ inbox }: { inbox: ReturnType<typeof useInbox> }) {
  const google = useGoogleCtx()
  const { mails, unread, loading, error, reload } = inbox
  return (
    <Card i={3} accent={SECTION_COLOR.mail} style={{ height: '100%' }}>
      <CardTitle
        icon={<MailIcon size={16} />} color={SECTION_COLOR.mail}
        title={<>Gmail {unread > 0 && <span className="pill" style={{ background: SECTION_COLOR.mail, color: '#0b0d17', fontWeight: 700 }}>{unread}</span>}</>}
        right={google.connected && <button className="icon-btn" onClick={reload} title="Actualizar"><RefreshCw size={14} className={loading ? 'spin' : ''} /></button>}
      />
      {!google.configured ? (
        <div className="empty">
          <div className="big">📬</div>
          <p>Configura <code>VITE_GOOGLE_CLIENT_ID</code> en <code>.env.local</code> para ver tu correo aquí.</p>
          <span className="faint" style={{ fontSize: 12 }}>Los pasos están en el README</span>
        </div>
      ) : !google.connected ? (
        <div className="empty">
          <div className="big">📬</div>
          <p>Conecta tu cuenta para ver la bandeja de entrada</p>
          <button className="btn primary" onClick={google.connect}>Conectar Google</button>
        </div>
      ) : error ? (
        <div className="error">{error}</div>
      ) : loading && !mails.length ? (
        <div className="skeleton" style={{ height: 240 }} />
      ) : mails.length === 0 ? (
        <div className="empty"><div className="big">✨</div><p>Bandeja vacía</p></div>
      ) : (
        mails.map((m) => {
          const color = AVATAR_COLORS[m.from.charCodeAt(0) % AVATAR_COLORS.length]
          return (
            <a key={m.id} className={`mail ${m.unread ? 'unread' : ''}`} href={m.link} target="_blank" rel="noreferrer">
              <div className="mail-avatar" style={{ background: color + '26', color, boxShadow: `inset 0 0 0 1px ${color}44` }}>{m.from.charAt(0).toUpperCase()}</div>
              <div className="mail-body">
                <div className="mail-top">
                  <span className="mail-from">{m.from}</span>
                  <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {m.unread && <span className="dot" style={{ background: SECTION_COLOR.mail }} />}
                    {sameDay(m.date, new Date()) ? hhmm(m.date) : m.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <div className="mail-subject">{m.subject}</div>
                <div className="mail-snippet">{m.snippet}</div>
              </div>
            </a>
          )
        })
      )}
    </Card>
  )
}

function AmiiboCard({ am }: { am: ReturnType<typeof useAmiiboCollection> }) {
  const { catalog, collection } = am
  const figures = catalog.filter((a) => a.type === 'Figure')
  const ownedFigures = figures.filter((a) => collection[a.id]?.status === 'owned').length
  const wish = Object.values(collection).filter((c) => c.status === 'wishlist').length
  const pct = figures.length ? ownedFigures / figures.length : 0
  const latest = Object.entries(collection)
    .filter(([, c]) => c.status === 'owned')
    .sort((a, b) => b[1].addedAt.localeCompare(a[1].addedAt))
    .slice(0, 9)
    .map(([id]) => catalog.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))

  return (
    <Card i={4} accent={SECTION_COLOR.amiibos} style={{ height: '100%' }} onClick={() => go('amiibos')}>
      <CardTitle
        icon={<Gamepad2 size={16} />} color={SECTION_COLOR.amiibos} title="Mi colección de amiibos"
        right={<span className="btn sm ghost">Gestionar <ArrowRight size={14} /></span>}
      />
      <div className="row" style={{ gap: 24, alignItems: 'center' }}>
        <Ring pct={pct} size={124} stroke={10} colors={['#fb7185', '#a78bfa']}>
          <div>
            <b style={{ fontSize: 30 }}><CountUp value={ownedFigures} /></b>
            <span className="faint" style={{ fontSize: 11 }}>de {figures.length || '…'}</span>
          </div>
        </Ring>
        <div style={{ flex: 1, minWidth: 0 }}>
          {latest.length ? (
            <div className="shelf">
              {latest.map((a, k) => (
                <img key={a.id} src={a.image} alt={a.name} title={a.name} loading="lazy" style={{ '--i': k } as CSSProperties} />
              ))}
            </div>
          ) : (
            <div className="shelf-empty">Tu estantería está vacía.<br />Marca los amiibos que tienes para verlos aquí ✨</div>
          )}
          <div className="row" style={{ gap: 16, marginTop: 12, fontSize: 13 }}>
            <span><b style={{ color: 'var(--rose)' }}>{Math.round(pct * 100)}%</b> <span className="muted">figuras</span></span>
            <span><b style={{ color: 'var(--pink)' }}>{wish}</b> <span className="muted">en deseados</span></span>
          </div>
        </div>
      </div>
    </Card>
  )
}

function FinanceCard() {
  const [accounts] = useAccounts()
  const [txs] = useTxs()
  const C = SECTION_COLOR.finance
  const worth = useMemo(() => netWorth(accounts, txs), [accounts, txs])
  // Mes actual, o el último con movimientos si este aún está vacío
  const key = useMemo(() => {
    const now = monthKey(new Date())
    if (!txs.length || txs.some((t) => t.date.startsWith(now))) return now
    return monthKey(txs.reduce((m, t) => (t.date > m ? t.date : m), ''))
  }, [txs])
  const flow = monthFlow(txs, key)
  const cats = spendByCategory(txs, key).slice(0, 4)
  const top = cats[0]?.value ?? 1
  const hasData = txs.length > 0 || Object.values(worth.balances).some(Boolean)
  const month = new Date(key + '-01T12:00').toLocaleDateString('es-ES', { month: 'long' })

  return (
    <Card i={6} accent={C} onClick={() => go('finance')}>
      <CardTitle
        icon={<Landmark size={16} />} color={C} title="Finanzas"
        right={<span className="btn sm ghost">Ver todo <ArrowRight size={14} /></span>}
      />
      {!hasData ? (
        <div className="empty" style={{ padding: '10px 0' }}>
          <div className="big">💶</div>
          <p>Importa los movimientos de tus bancos para ver aquí tu patrimonio y en qué se va el dinero</p>
        </div>
      ) : (
        <div className="bento" style={{ gap: 24, alignItems: 'center' }}>
          <div className="span-4">
            <div className="muted" style={{ fontSize: 13 }}>Patrimonio neto</div>
            <div className="acct-balance" style={{ fontSize: 36, border: 0, padding: 0, margin: '4px 0 0' }}><Money v={worth.total} decimals={0} /></div>
            <div className="faint" style={{ fontSize: 12.5 }}>
              <Money v={worth.liquid} decimals={0} /> en cuentas · <Money v={worth.invest} decimals={0} /> invertido
            </div>
          </div>
          <div className="span-4">
            <div className="stat-tiles" style={{ marginTop: 0 }}>
              <div className="stat-tile" style={{ '--c': 'var(--green)' } as CSSProperties}>
                <div className="v" style={{ fontSize: 22 }}><Money v={flow.income} decimals={0} /></div>
                <div className="l">ingresos de {month}</div>
              </div>
              <div className="stat-tile" style={{ '--c': 'var(--rose)' } as CSSProperties}>
                <div className="v" style={{ fontSize: 22 }}><Money v={flow.expense} decimals={0} /></div>
                <div className="l">gastos de {month}</div>
              </div>
            </div>
          </div>
          <div className="span-4 fin-mini-cats">
            {cats.length ? cats.map((c, k) => (
              <div key={c.cat.id} style={{ fontSize: 13 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span>{c.cat.emoji} {c.cat.label}</span>
                  <Money v={c.value} decimals={0} className="muted" />
                </div>
                <div className="track"><i style={{ width: `${(c.value / top) * 100}%`, background: c.cat.color, animationDelay: `${k * 80}ms` }} /></div>
              </div>
            )) : <div className="faint" style={{ fontSize: 13 }}>Sin gastos en {month}</div>}
          </div>
        </div>
      )}
    </Card>
  )
}

function WeekCard({ f }: { f: Forecast | null }) {
  if (!f) return <div className="skeleton" style={{ height: '100%', minHeight: 250 }} />
  const lo = Math.min(...f.days.map((d) => d.min))
  const hi = Math.max(...f.days.map((d) => d.max))
  const pct = (v: number) => ((v - lo) / (hi - lo || 1)) * 100
  return (
    <Card i={5} accent={SECTION_COLOR.weather} style={{ height: '100%' }} onClick={() => go('weather')}>
      <CardTitle icon={<CloudSun size={16} />} color={SECTION_COLOR.weather} title="La semana en Madrid" />
      <div className="grid" style={{ gap: 6 }}>
        {f.days.map((d, i) => (
          <div key={i} className="row" style={{ fontSize: 13, gap: 12 }}>
            <span className="cap" style={{ width: 54, fontWeight: 500 }}>
              {i === 0 ? 'Hoy' : d.date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}
            </span>
            <span style={{ fontSize: 18, width: 24 }}>{wmoIcon(d.code)}</span>
            <span className="faint" style={{ width: 30, textAlign: 'right' }}>{Math.round(d.min)}°</span>
            <div className="temp-range" style={{ flex: 1, margin: 0, width: 'auto' }}>
              <div style={{ left: `${pct(d.min)}%`, right: `${100 - pct(d.max)}%` }} />
            </div>
            <span style={{ width: 30, fontWeight: 600 }}>{Math.round(d.max)}°</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
