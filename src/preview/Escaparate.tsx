// Maqueta "Escaparate": oscura y de cine. Arriba, una portada a pantalla completa que va pasando entre
// hoy, el próximo lanzamiento y la cartera; debajo, tu día en una línea de tiempo y filas que se deslizan.

import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, LogIn } from 'lucide-react'
import WeatherScene, { sceneKind } from '../components/WeatherScene'
import { capitalize } from '../components/ui'
import { sameDay } from '../lib/events'
import { wmoIcon, wmoText } from '../lib/weather'
import type { SectionId } from '../lib/nav'
import type { Position } from '../lib/portfolio'
import { Money } from '../sections/Finance'
import { Logo } from '../sections/PortfolioDetail'
import { countdown, fmtDay, greeting, hhmm, hueOf, pct, summary, useHome, type HomeData } from './data'
import { Poster, SyncPill, posterUrl } from './Art'
import { skyColors, skyPhase } from './sky'

const NAV: { id: SectionId; label: string }[] = [
  { id: 'calendar', label: 'Calendario' },
  { id: 'weather', label: 'El tiempo' },
  { id: 'finance', label: 'Dinero' },
  { id: 'games', label: 'Juegos' },
  { id: 'amiibos', label: 'Amiibos' },
]

export default function Escaparate() {
  const h = useHome()
  return (
    <div className="e">
      <header className="e-top">
        <a className="e-brand" href="/">Mi vida</a>
        <nav className="e-nav" aria-label="Secciones">
          {NAV.map((n) => <a key={n.id} href={`/#${n.id}`}>{n.label}</a>)}
        </nav>
        <SyncPill className="e-pill" />
      </header>
      <Hero h={h} />
      <main className="e-main">
        <Day h={h} />
        <ReleasesRail h={h} />
        <PortfolioRail positions={h.money.pf.positions} />
        <Shelf h={h} />
        <div className="e-split">
          <Month h={h} />
          <MailBox h={h} />
        </div>
      </main>
    </div>
  )
}

// ---------- Portada ----------

interface Slide { id: string; tab: string; accent: string; bg: ReactNode; body: ReactNode }

function Hero({ h }: { h: HomeData }) {
  const slides = useSlides(h)
  const [i, setI] = useState(0)
  const cur = Math.min(i, slides.length - 1)
  return (
    <section className="e-hero" aria-roledescription="carrusel" aria-label="Destacados" style={{ '--a': slides[cur].accent } as CSSProperties}>
      {slides.map((s, k) => (
        <div key={s.id} className={`e-slide ${k === cur ? 'on' : ''}`} aria-hidden={k !== cur}>
          <div className="e-slide-bg">{s.bg}</div>
          <div className="e-slide-body">{s.body}</div>
        </div>
      ))}
      {slides.length > 1 && (
        <div className="e-tabs" role="tablist">
          {slides.map((s, k) => (
            <button key={s.id} role="tab" aria-selected={k === cur} className={k === cur ? 'on' : ''} onClick={() => setI(k)}>
              {s.tab}
              <span className="e-tab-bar"><i key={`${cur}`} onAnimationEnd={() => setI((cur + 1) % slides.length)} /></span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function useSlides(h: HomeData): Slide[] {
  const { now, f, upcoming, money } = h
  const out: Slide[] = []

  // Hoy: el cielo real de Madrid detrás
  const day = f?.days[0]
  const phase = skyPhase(now, day?.sunrise, day?.sunset)
  const code = f?.current.code ?? 1
  const sky = skyColors(phase, ['cloudy', 'rain', 'storm', 'snow', 'fog'].includes(sceneKind(code)))
  const isDay = phase === 'day' || phase === 'golden'
  out.push({
    id: 'today', tab: 'Hoy', accent: '#ffb547',
    bg: (
      <>
        <div className="e-sky" style={{ background: `linear-gradient(180deg, ${sky.sky.join(', ')})` }} />
        <WeatherScene code={code} isDay={isDay} density={1.2} />
      </>
    ),
    body: (
      <div className="e-today">
        <p className="e-kicker">{capitalize(now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
        <div className="e-huge" aria-label={`Son las ${hhmm(now)}`}>{hhmm(now)}</div>
        <h1 className="e-title">{greeting(now.getHours())}</h1>
        <p className="e-lede">{summary(h).join(' ')}</p>
        {f && (
          <a className="e-wx" href="/#weather">
            <span className="e-wx-icon" aria-hidden>{wmoIcon(f.current.code, f.current.isDay)}</span>
            <b>{Math.round(f.current.temp)}°</b>
            <span>{wmoText(f.current.code)}<br /><small>Máx {Math.round(day!.max)}°, mín {Math.round(day!.min)}°</small></span>
          </a>
        )}
      </div>
    ),
  })

  // Próximo lanzamiento: su portada a toda pantalla
  const g = upcoming[0]
  if (g) {
    const c = countdown(g.released, g.tba)
    const art = posterUrl(g)
    const hue = hueOf(g.name)
    out.push({
      id: 'release', tab: 'Lanzamiento', accent: `hsl(${hue} 95% 68%)`,
      bg: (
        <div className="e-release-bg" style={{ '--h': hue, '--img': art ? `url(${art})` : 'none' } as CSSProperties} />
      ),
      body: (
        <div className="e-release">
          <div className="e-release-text">
            <p className="e-kicker">{c.n != null ? 'Sale en' : 'Próximo lanzamiento'}</p>
            <div className="e-huge">{c.n != null ? <>{c.n}<span>{c.u}</span></> : <span className="solo">{c.u}</span>}</div>
            <h2 className="e-title">{g.name}</h2>
            <p className="e-lede">
              {g.released && !g.tba ? `El ${fmtDay(g.released)}` : 'Aún sin fecha'}
              {g.platforms?.length ? `, en ${g.platforms.slice(0, 3).join(', ')}` : ''}.
              {upcoming.length > 1 && ` Después llega ${upcoming[1].name}.`}
            </p>
            <a className="e-cta" href="/#games">Ver mis juegos</a>
          </div>
          <a className="e-release-box" href="/#games" aria-label={g.name}><Poster g={g} /></a>
        </div>
      ),
    })
  }

  // Cartera: cuánto vale y cómo va hoy
  const t = money.pf.totals
  if (t) {
    const up = t.day >= 0
    const pos = [...money.pf.positions].filter((p) => p.value != null).sort((a, b) => b.value! - a.value!)
    const total = pos.reduce((s, p) => s + p.value!, 0)
    out.push({
      id: 'money', tab: 'Cartera', accent: up ? '#3ee6a2' : '#ff6b6b',
      bg: <div className={`e-money-bg ${up ? 'up' : 'down'}`}><BigSpark positions={pos} /></div>,
      body: (
        <div className="e-money">
          <p className="e-kicker">Tu cartera vale</p>
          <div className="e-huge e-cash"><Money v={t.value} decimals={0} /></div>
          <h2 className="e-title">{up ? 'Sube' : 'Baja'} <Money v={Math.abs(t.day)} decimals={0} /> hoy ({pct(t.dayPct)})</h2>
          <p className="e-lede">Desde que empezaste, {t.gain >= 0 ? 'ganas' : 'pierdes'} <Money v={Math.abs(t.gain)} decimals={0} /> ({pct(t.gainPct)}). Patrimonio neto: <Money v={money.worth.total} decimals={0} />.</p>
          <div className="e-alloc" aria-label="Reparto de la cartera">
            {pos.map((p) => (
              <span key={p.holding.id} style={{ flexGrow: p.value! / total }} title={`${p.holding.name}: ${Math.round((p.value! / total) * 100)} %`}>
                <Logo isin={p.holding.isin} name={p.holding.name} />
                <em>{Math.round((p.value! / total) * 100)} %</em>
              </span>
            ))}
          </div>
          <a className="e-cta" href="/#finance">Ver la cartera</a>
        </div>
      ),
    })
  }
  return out
}

/** Curva de hoy de la posición más grande, enorme y de fondo. */
function BigSpark({ positions }: { positions: Position[] }) {
  const s = positions.find((p) => p.quote && !p.quote.daily && p.quote.spark.length > 2)?.quote?.spark ?? positions[0]?.quote?.spark ?? []
  if (s.length < 2) return null
  const lo = Math.min(...s), hi = Math.max(...s)
  const pts = s.map((v, i) => `${(i / (s.length - 1)) * 1000},${hi === lo ? 200 : 360 - ((v - lo) / (hi - lo)) * 300}`)
  return (
    <svg viewBox="0 0 1000 400" preserveAspectRatio="none" aria-hidden>
      <path d={`M0,400 L${pts.join(' L')} L1000,400 Z`} className="area" />
      <path d={`M${pts.join(' L')}`} className="line" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// ---------- Tu día ----------

function Day({ h }: { h: HomeData }) {
  const { now, f, events } = h
  const start = new Date(now); start.setHours(7, 0, 0, 0)
  const end = new Date(now); end.setHours(24, 0, 0, 0)
  const span = end.getTime() - start.getTime()
  const x = (d: Date) => Math.max(0, Math.min(1, (d.getTime() - start.getTime()) / span))
  const today = events.filter((e) => sameDay(e.start, now) && !e.allDay)
  const allDay = events.filter((e) => e.allDay && (sameDay(e.start, now) || (e.start < now && e.end > now)))
  const temps = (f?.hours ?? []).filter((p) => p.time >= start && p.time <= end)
  const tl = Math.min(...temps.map((p) => p.temp)), th = Math.max(...temps.map((p) => p.temp))
  const curve = temps.map((p) => `${x(p.time) * 1000},${th === tl ? 40 : 70 - ((p.temp - tl) / (th - tl)) * 55}`)
  const hot = temps.find((p) => p.temp === th)
  const ticks = [9, 12, 15, 18, 21]
  const days = Array.from({ length: 6 }, (_, i) => new Date(h.from.getTime() + (i + 1) * 86400_000))

  return (
    <section className="e-sec">
      <Head title="Tu día" href="/#calendar" link="Abrir calendario">
        {allDay.map((e) => <span key={e.id} className="e-chip" style={{ '--c': e.color } as CSSProperties}>{e.title}</span>)}
      </Head>
      <div className="e-timeline">
        {curve.length > 1 && (
          <svg className="e-temp" viewBox="0 0 1000 80" preserveAspectRatio="none" aria-hidden>
            <path d={`M${curve.join(' L')}`} vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        {hot && <span className="e-temp-label" style={{ left: `${x(hot.time) * 100}%` }}>{Math.round(hot.temp)}°</span>}
        <div className="e-track">
          {ticks.map((t) => <span key={t} className="e-tick" style={{ left: `${((t - 7) / 17) * 100}%` }}>{t}:00</span>)}
          {today.map((e, k) => {
            const a = x(e.start), b = Math.max(x(e.end), a + 0.06)
            return (
              <div key={e.id} className={`e-block ${e.end < now ? 'past' : ''}`} style={{ left: `${a * 100}%`, width: `${(b - a) * 100}%`, '--c': e.color, '--row': k % 2 } as CSSProperties}>
                <b>{hhmm(e.start)}</b> {e.title}
              </div>
            )
          })}
          {!today.length && <p className="e-free">Hoy no tienes nada con hora. Día libre.</p>}
          {now >= start && now <= end && <span className="e-now" style={{ left: `${x(now) * 100}%` }}><i>{hhmm(now)}</i></span>}
        </div>
      </div>
      <div className="e-next-days">
        {days.map((d) => {
          const items = events.filter((e) => sameDay(e.start, d))
          const wx = f?.days.find((w) => sameDay(w.date, d))
          return (
            <div key={d.getTime()} className={`e-nd ${items.length ? '' : 'free'}`}>
              <div className="e-nd-head">
                <span>{d.toLocaleDateString('es-ES', { weekday: 'long' })}</span>
                <b>{d.getDate()}</b>
                {wx && <em>{wmoIcon(wx.code)} {Math.round(wx.max)}°</em>}
              </div>
              {items.slice(0, 2).map((e) => <div key={e.id} className="e-nd-ev" style={{ '--c': e.color } as CSSProperties}>{!e.allDay && <b>{hhmm(e.start)}</b>} {e.title}</div>)}
              {items.length > 2 && <div className="e-nd-more">y {items.length - 2} más</div>}
              {!items.length && <div className="e-nd-more">Libre</div>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---------- Filas ----------

function Head({ title, href, link, children }: { title: string; href?: string; link?: string; children?: ReactNode }) {
  return (
    <div className="e-head">
      <h2>{title}</h2>
      {children}
      {href && <a href={href}>{link}</a>}
    </div>
  )
}

function Rail({ title, href, link, children }: { title: string; href: string; link: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const move = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' })
  return (
    <section className="e-sec">
      <Head title={title} href={href} link={link}>
        <span className="e-arrows">
          <button onClick={() => move(-1)} aria-label="Anteriores"><ChevronLeft size={18} /></button>
          <button onClick={() => move(1)} aria-label="Siguientes"><ChevronRight size={18} /></button>
        </span>
      </Head>
      <div className="e-rail" ref={ref}>{children}</div>
    </section>
  )
}

function ReleasesRail({ h }: { h: HomeData }) {
  if (!h.upcoming.length)
    return (
      <section className="e-sec">
        <Head title="Por salir" href="/#games" link="Buscar juegos" />
        <p className="e-empty">Apunta en Juegos algo que aún no haya salido y aquí tendrás la cuenta atrás.</p>
      </section>
    )
  return (
    <Rail title="Por salir" href="/#games" link="Ver todos">
      {h.upcoming.slice(0, 12).map((g) => {
        const c = countdown(g.released, g.tba)
        return (
          <a key={g.id} className="e-poster" href="/#games">
            <Poster g={g} />
            <div className="e-poster-info">
              <div className="e-poster-count">{c.n != null ? <><b>{c.n}</b> {c.u}</> : c.u}</div>
              <div className="e-poster-name">{g.name}</div>
              <div className="e-poster-date">{g.released && !g.tba ? fmtDay(g.released) : 'Por anunciar'}</div>
            </div>
          </a>
        )
      })}
    </Rail>
  )
}

function PortfolioRail({ positions }: { positions: Position[] }) {
  const list = useMemo(() => [...positions].sort((a, b) => (b.value ?? b.cost) - (a.value ?? a.cost)), [positions])
  if (!list.length) return null
  return (
    <Rail title="Tu cartera" href="/#finance" link="Ver la cartera">
      {list.map((p) => {
        const s = p.quote?.spark ?? []
        const lo = Math.min(...s), hi = Math.max(...s)
        const up = (p.dayPct ?? 0) >= 0
        return (
          <a key={p.holding.id} className={`e-stock ${up ? 'up' : 'down'}`} href="/#finance">
            <div className="e-stock-top">
              <Logo isin={p.holding.isin} name={p.holding.name} />
              <span className="e-stock-name">{p.holding.name}</span>
            </div>
            {s.length > 1 && (
              <svg viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden>
                <path d={`M${s.map((v, i) => `${(i / (s.length - 1)) * 100},${hi === lo ? 18 : 33 - ((v - lo) / (hi - lo)) * 30}`).join(' L')}`} vectorEffect="non-scaling-stroke" />
              </svg>
            )}
            <div className="e-stock-foot">
              <b>{p.value != null ? <Money v={p.value} decimals={0} /> : '…'}</b>
              {p.dayPct != null && <span>{pct(p.dayPct)}</span>}
            </div>
          </a>
        )
      })}
    </Rail>
  )
}

function Shelf({ h }: { h: HomeData }) {
  const { owned, total, wish, latest } = h.amiibos
  return (
    <section className="e-sec e-shelf">
      <Head title="La estantería" href="/#amiibos" link="Gestionar amiibos">
        <span className="e-note">{owned} de {total || '…'} figuras{wish ? `, ${wish} en deseados` : ''}</span>
      </Head>
      {latest.length ? (
        <div className="e-stage">
          {latest.map((a) => (
            <figure key={a.id}>
              <img src={a.image} alt="" loading="lazy" />
              <figcaption>{a.name}</figcaption>
            </figure>
          ))}
        </div>
      ) : <p className="e-empty">Marca en Amiibos los que tienes y aparecerán aquí, bajo los focos.</p>}
    </section>
  )
}

function Month({ h }: { h: HomeData }) {
  const { flow, cats, month, hasData } = h.money
  const top = cats.slice(0, 5)
  const max = top[0]?.value ?? 1
  return (
    <section className="e-card">
      <Head title={`Tu ${month}`} href="/#finance" link="Movimientos" />
      {!hasData || !flow.expense ? (
        <p className="e-empty">Importa los movimientos de tus bancos en Dinero para ver aquí en qué se va el mes.</p>
      ) : (
        <>
          <div className="e-flow">
            <div><span>Gastado</span><b><Money v={flow.expense} decimals={0} /></b></div>
            <div><span>Entrado</span><b><Money v={flow.income} decimals={0} /></b></div>
            <div><span>Ahorro</span><b className={flow.income - flow.expense >= 0 ? 'pos' : 'neg'}><Money v={flow.income - flow.expense} decimals={0} sign /></b></div>
          </div>
          <ul className="e-cats">
            {top.map((c) => (
              <li key={c.cat.id} style={{ '--c': c.cat.color, '--w': c.value / max } as CSSProperties}>
                <span>{c.cat.emoji} {c.cat.label}</span>
                <i aria-hidden />
                <b><Money v={c.value} decimals={0} /></b>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function MailBox({ h }: { h: HomeData }) {
  const { google: g, inbox } = h
  return (
    <section className="e-card">
      <Head title="Correo">{g.connected && inbox.unread > 0 && <span className="e-note">{inbox.unread} sin leer</span>}</Head>
      {!g.configured ? (
        <p className="e-empty">Añade VITE_GOOGLE_CLIENT_ID para ver aquí tu correo.</p>
      ) : !g.connected ? (
        <button className="e-cta" onClick={g.connect}><LogIn size={15} /> Conectar Google</button>
      ) : inbox.error ? (
        <p className="e-empty">{inbox.error}</p>
      ) : (
        <ul className="e-mails">
          {inbox.mails.slice(0, 5).map((m) => (
            <li key={m.id} className={m.unread ? 'unread' : ''}>
              <a href={m.link} target="_blank" rel="noreferrer">
                <b>{m.from}</b>
                <span>{m.subject}</span>
                <time>{sameDay(m.date, new Date()) ? hhmm(m.date) : m.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</time>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
