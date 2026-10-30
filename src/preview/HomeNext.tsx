// Propuesta de Inicio: "Una ventana a Madrid". El cielo real a pantalla completa con el horizonte de la
// ciudad, y debajo la semana, los juegos por salir, la estantería de amiibos, el dinero y el correo.

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { LogIn, RefreshCw } from 'lucide-react'
import WeatherScene, { sceneKind } from '../components/WeatherScene'
import { CountUp, capitalize } from '../components/ui'
import { SECTION_COLOR, useGoogleCtx, type SectionId } from '../lib/nav'
import { useEvents, sameDay } from '../lib/events'
import type { CalEvent } from '../lib/google'
import { useForecast } from '../lib/useWeather'
import { MADRID, wmoText, type Forecast } from '../lib/weather'
import { cover, daysUntil, isUpcoming, todayYmd, useGames, type Game } from '../lib/games'
import { monthFlow, monthKey, netWorth, spendByCategory, useAccounts, useTxs } from '../lib/finance'
import { syncNow, useSyncStatus } from '../lib/sync'
import { useAmiiboCollection } from '../sections/Amiibos'
import { useInbox } from '../sections/Home'
import { Money } from '../sections/Finance'
import { ReleaseAlerts } from '../sections/Games'
import { Skyline } from './Skyline'
import { isLit, skyColors, skyPhase } from './sky'

const open = (id: SectionId) => location.assign(`/#${id}`)
const hhmm = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function greeting(h: number) {
  if (h < 6) return 'Buenas noches'
  if (h < 13) return 'Buenos días'
  if (h < 21) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Cuenta atrás grande: número y unidad por separado. */
function countParts(date?: string, tba?: boolean) {
  if (tba || !date) return { n: null, u: 'Sin fecha' }
  const d = daysUntil(date)
  if (d <= 0) return { n: null, u: 'Hoy' }
  if (d < 60) return { n: d, u: d === 1 ? 'día' : 'días' }
  const m = Math.round(d / 30.4)
  return { n: m, u: m === 1 ? 'mes' : 'meses' }
}

const fmtDay = (d: string) => new Date(d + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })

export default function HomeNext() {
  const google = useGoogleCtx()
  const now = useClock()
  const madrid = useForecast(MADRID)
  const [from, to] = useMemo(() => {
    const f = new Date()
    f.setHours(0, 0, 0, 0)
    return [f, new Date(f.getTime() + 7 * 86400_000)]
  }, [])
  const { events } = useEvents(from, to, google.connected)
  const [games] = useGames()

  const today = todayYmd()
  const upcoming = games
    .filter((g) => g.status !== 'done' && g.status !== 'dropped' && isUpcoming(g, today))
    .sort((a, b) => (a.tba || !a.released ? 1 : 0) - (b.tba || !b.released ? 1 : 0) || (a.released ?? '').localeCompare(b.released ?? ''))

  return (
    <div className="nx">
      <Hero now={now} f={madrid.data} events={events} next={upcoming[0]} />
      <main className="nx-main">
        <ReleaseAlerts />
        <Week from={from} events={events} f={madrid.data} />
        <Releases games={upcoming} />
        <div className="nx-split">
          <Shelf />
          <div className="nx-stack">
            <MoneyBlock />
            <MailBlock />
          </div>
        </div>
      </main>
    </div>
  )
}

// ---------- Cielo ----------

const NAV: { id: SectionId; label: string }[] = [
  { id: 'calendar', label: 'Calendario' },
  { id: 'weather', label: 'El tiempo' },
  { id: 'finance', label: 'Dinero' },
  { id: 'games', label: 'Juegos' },
  { id: 'amiibos', label: 'Amiibos' },
]

function Hero({ now, f, events, next }: { now: Date; f: Forecast | null; events: CalEvent[]; next?: Game }) {
  const day = f?.days[0]
  const phase = skyPhase(now, day?.sunrise, day?.sunset)
  const code = f?.current.code ?? 1
  const overcast = ['cloudy', 'rain', 'storm', 'snow', 'fog'].includes(sceneKind(code))
  const sky = skyColors(phase, overcast)
  const lit = isLit(phase)
  // Sol o luna según la misma fase que pinta el cielo, para que nunca se contradigan
  const isDay = phase === 'day' || phase === 'golden'

  const later = events.filter((e) => sameDay(e.start, now) && !e.allDay && e.start > now)
  const tomorrow = f?.days[1]
  const lines: string[] = []
  if (later.length) lines.push(`Lo próximo: ${later[0].title}, a las ${hhmm(later[0].start)}${later.length > 1 ? `, y ${later.length - 1} más` : ''}.`)
  else lines.push('No te queda nada más en la agenda de hoy.')
  if (next?.released && !next.tba) {
    const n = daysUntil(next.released)
    lines.push(n === 1 ? `${next.name} sale mañana.` : `${next.name} sale en ${n} días.`)
  }
  if (tomorrow && tomorrow.rainProb >= 50) lines.push(`Mañana llueve (${tomorrow.rainProb} %).`)

  const sunText = day ? (now < day.sunset ? `Atardece a las ${hhmm(day.sunset)}` : `Amanece a las ${hhmm(f!.days[1]?.sunrise ?? day.sunrise)}`) : ''

  return (
    <header className="nx-hero" style={{ background: `linear-gradient(180deg, ${sky.sky.join(', ')})` } as CSSProperties}>
      <div className="nx-haze" style={{ background: `radial-gradient(60% 55% at 50% 100%, ${sky.haze}, transparent 70%)` }} />
      <WeatherScene code={code} isDay={isDay} density={1.4} />
      <Skyline city={sky.city} lit={lit} />
      <div className="nx-ground" />

      <nav className="nx-top" aria-label="Secciones">
        <a className="nx-brand" href="/">Mi vida</a>
        <div className="nx-links">
          {NAV.map((n) => (
            <a key={n.id} href={`/#${n.id}`} style={{ '--c': SECTION_COLOR[n.id] } as CSSProperties}><i />{n.label}</a>
          ))}
        </div>
        <SyncPill />
      </nav>

      <div className="nx-hero-body">
        <div className="nx-now">
          <p className="nx-date">{capitalize(now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
          <div className="nx-clock" aria-label={`Son las ${hhmm(now)}`}>
            {hhmm(now)}<span>{String(now.getSeconds()).padStart(2, '0')}</span>
          </div>
          <h1 className="nx-greet">{greeting(now.getHours())}.</h1>
          <p className="nx-summary">{lines.join(' ')}</p>
        </div>

        <button className="nx-weather" onClick={() => open('weather')} aria-label="Abrir el tiempo">
          {f ? (
            <>
              <div className="nx-temp">{Math.round(f.current.temp)}°</div>
              <div className="nx-cond">{wmoText(f.current.code)} en Madrid</div>
              <div className="nx-minmax">Máx {Math.round(day!.max)}° · mín {Math.round(day!.min)}° · {sunText}</div>
              <div className="nx-hours">
                {f.hours.filter((h) => h.time > now).slice(0, 6).map((h) => (
                  <span key={h.time.getTime()}><b>{Math.round(h.temp)}°</b>{h.time.getHours()}h</span>
                ))}
              </div>
            </>
          ) : <div className="nx-cond">Cargando el tiempo…</div>}
        </button>
      </div>
    </header>
  )
}

function SyncPill() {
  const g = useGoogleCtx()
  const s = useSyncStatus()
  if (!g.configured) return null
  if (!g.connected) return <button className="nx-pill" onClick={g.connect}><LogIn size={14} /> Conectar Google</button>
  const label = s.kind === 'syncing' ? 'Sincronizando…' : s.kind === 'error' ? 'Error al sincronizar' : s.kind === 'off' ? 'Sin sincronizar' : 'Sincronizado'
  return (
    <button className={`nx-pill ${s.kind === 'error' ? 'err' : ''}`} onClick={() => (s.kind === 'off' ? g.connect() : syncNow())} title={s.kind === 'error' ? s.message : 'Sincronizar ahora'}>
      <RefreshCw size={13} className={s.kind === 'syncing' ? 'spin' : ''} /> {label}
    </button>
  )
}

// ---------- Bloques ----------

function Head({ id, title, action, children }: { id: SectionId | 'mail'; title: string; action?: string; children?: ReactNode }) {
  return (
    <div className="nx-head" style={{ '--c': SECTION_COLOR[id] } as CSSProperties}>
      <h2><i />{title}</h2>
      {children}
      {action && id !== 'mail' && <a href={`/#${id}`}>{action}</a>}
    </div>
  )
}

function Week({ from, events, f }: { from: Date; events: CalEvent[]; f: Forecast | null }) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(from.getTime() + i * 86400_000))
  return (
    <section className="nx-block">
      <Head id="calendar" title="Esta semana" action="Abrir calendario" />
      <div className="nx-week">
        {days.map((d, i) => {
          const items = events.filter((e) => sameDay(e.start, d) || (e.start < d && e.end > d))
          const wx = f?.days.find((x) => sameDay(x.date, d))
          return (
            <div key={i} className={`nx-day ${i === 0 ? 'today' : ''} ${items.length ? '' : 'free'}`}>
              <div className="nx-day-top">
                <span>{i === 0 ? 'Hoy' : d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}</span>
                {wx && <span className="nx-day-wx">{Math.round(wx.max)}°</span>}
              </div>
              <div className="nx-day-num">{d.getDate()}</div>
              <div className="nx-day-items">
                {items.slice(0, 3).map((e) => (
                  <div key={e.id} className="nx-ev" style={{ '--c': e.color } as CSSProperties}>
                    {!e.allDay && <b>{hhmm(e.start)}</b>}<span>{e.title}</span>
                  </div>
                ))}
                {items.length > 3 && <div className="nx-more">y {items.length - 3} más</div>}
                {!items.length && <div className="nx-more">Libre</div>}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Releases({ games }: { games: Game[] }) {
  if (!games.length)
    return (
      <section className="nx-block">
        <Head id="games" title="Por salir" action="Buscar juegos" />
        <p className="nx-empty">Apunta en Juegos algo que aún no haya salido y aquí verás la cuenta atrás.</p>
      </section>
    )
  return (
    <section className="nx-block">
      <Head id="games" title="Por salir" action="Ver todos" />
      <div className="nx-posters">
        {games.slice(0, 5).map((g, i) => {
          const c = countParts(g.released, g.tba)
          return (
            <a key={g.id} href="/#games" className={`nx-poster ${i === 0 ? 'big' : ''}`}
              style={{ '--img': g.image ? `url(${cover(g.image)})` : 'none', '--hue': `${250 + ((g.name.length * 37) % 90)}` } as CSSProperties}>
              <div className="nx-poster-art" />
              <div className="nx-poster-body">
                <div className="nx-count">{c.n != null ? <CountUp value={c.n} duration={1200} /> : null}<span>{c.u}</span></div>
                <div className="nx-poster-title">{g.name}</div>
                <div className="nx-poster-date">{g.released && !g.tba ? fmtDay(g.released) : 'Fecha por anunciar'}{g.platforms?.length ? ` · ${g.platforms.slice(0, 2).join(', ')}` : ''}</div>
              </div>
            </a>
          )
        })}
      </div>
    </section>
  )
}

function Shelf() {
  const { catalog, collection } = useAmiiboCollection()
  const figures = catalog.filter((a) => a.type === 'Figure')
  const owned = figures.filter((a) => collection[a.id]?.status === 'owned').length
  const wish = Object.values(collection).filter((c) => c.status === 'wishlist').length
  const latest = Object.entries(collection)
    .filter(([, c]) => c.status === 'owned')
    .sort((a, b) => b[1].addedAt.localeCompare(a[1].addedAt))
    .map(([id]) => catalog.find((a) => a.id === id))
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .slice(0, 10)
  const pct = figures.length ? owned / figures.length : 0
  return (
    <section className="nx-block nx-shelf-block">
      <Head id="amiibos" title="La estantería" action="Gestionar">
        <span className="nx-head-note">{owned} de {figures.length || '…'} figuras{wish ? ` · ${wish} en deseados` : ''}</span>
      </Head>
      {latest.length ? (
        <div className="nx-shelf">
          {latest.map((a, k) => <img key={a.id} src={a.image} alt={a.name} title={a.name} loading="lazy" style={{ '--k': k } as CSSProperties} />)}
        </div>
      ) : (
        <p className="nx-empty">Marca en Amiibos los que tienes y aparecerán aquí, de pie en la balda.</p>
      )}
      <div className="nx-board" />
      <div className="nx-progress" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Colección completada">
        <div style={{ width: `${pct * 100}%` }} />
      </div>
    </section>
  )
}

function MoneyBlock() {
  const [accounts] = useAccounts()
  const [txs] = useTxs()
  const worth = useMemo(() => netWorth(accounts, txs), [accounts, txs])
  const key = useMemo(() => {
    const now = monthKey(new Date())
    if (!txs.length || txs.some((t) => t.date.startsWith(now))) return now
    return monthKey(txs.reduce((m, t) => (t.date > m ? t.date : m), ''))
  }, [txs])
  const flow = monthFlow(txs, key)
  const cats = spendByCategory(txs, key).slice(0, 3)
  const month = new Date(key + '-01T12:00').toLocaleDateString('es-ES', { month: 'long' })
  const spentPct = flow.income ? Math.min(100, (flow.expense / flow.income) * 100) : flow.expense ? 100 : 0
  return (
    <section className="nx-block nx-money">
      <Head id="finance" title="Dinero" action="Movimientos" />
      {!txs.length ? (
        <p className="nx-empty">Importa los movimientos de tus bancos en Dinero para ver aquí el mes.</p>
      ) : (
        <>
          <div className="nx-worth"><Money v={worth.total} decimals={0} /></div>
          <div className="nx-sub">Patrimonio neto</div>
          <div className="nx-flow" aria-hidden><div style={{ width: `${spentPct}%` }} /></div>
          <div className="nx-flow-legend">
            <span>Gastado en {month} <b><Money v={flow.expense} decimals={0} /></b></span>
            <span>Entrado <b><Money v={flow.income} decimals={0} /></b></span>
          </div>
          <div className="nx-cats">
            {cats.map((c) => <span key={c.cat.id} style={{ '--c': c.cat.color } as CSSProperties}><i />{c.cat.label} <Money v={c.value} decimals={0} /></span>)}
          </div>
        </>
      )}
    </section>
  )
}

function MailBlock() {
  const g = useGoogleCtx()
  const inbox = useInbox(g.connected)
  return (
    <section className="nx-block nx-mail">
      <Head id="mail" title="Correo">
        {g.connected && inbox.unread > 0 && <span className="nx-head-note">{inbox.unread} sin leer</span>}
      </Head>
      {!g.configured ? (
        <p className="nx-empty">Añade VITE_GOOGLE_CLIENT_ID para ver aquí tu correo.</p>
      ) : !g.connected ? (
        <button className="nx-pill solid" onClick={g.connect}><LogIn size={14} /> Conectar Google</button>
      ) : inbox.error ? (
        <p className="nx-empty">{inbox.error}</p>
      ) : (
        <ul>
          {inbox.mails.slice(0, 4).map((m) => (
            <li key={m.id} className={m.unread ? 'unread' : ''}>
              <a href={m.link} target="_blank" rel="noreferrer">
                <span className="nx-mail-from">{m.from}</span>
                <span className="nx-mail-sub">{m.subject}</span>
                <span className="nx-mail-when">{sameDay(m.date, new Date()) ? hhmm(m.date) : m.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
