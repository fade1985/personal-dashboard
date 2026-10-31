// Maqueta "Consola": fondo claro y bloques de color de distintos tamaños, como el menú de una consola.
// Las portadas y los amiibos se salen de su bloque; al abrir la página los bloques entran uno tras otro.

import type { CSSProperties, ReactNode } from 'react'
import { CalendarDays, CloudSun, Gamepad2, Joystick, Landmark, Mail, TrendingDown, TrendingUp } from 'lucide-react'
import { capitalize } from '../components/ui'
import { sameDay } from '../lib/events'
import { wmoIcon, wmoText } from '../lib/weather'
import type { SectionId } from '../lib/nav'
import { Money } from '../sections/Finance'
import { Logo } from '../sections/PortfolioDetail'
import { countdown, fmtDay, greeting, hhmm, open, pct, summary, useHome, type HomeData } from './data'
import { Poster, SyncPill } from './Art'

const APPS: { id: SectionId; label: string; icon: ReactNode; c: string }[] = [
  { id: 'calendar', label: 'Calendario', icon: <CalendarDays size={22} />, c: 'var(--k-cal)' },
  { id: 'weather', label: 'El tiempo', icon: <CloudSun size={22} />, c: 'var(--k-sun)' },
  { id: 'finance', label: 'Dinero', icon: <Landmark size={22} />, c: 'var(--k-mint)' },
  { id: 'games', label: 'Juegos', icon: <Joystick size={22} />, c: 'var(--k-tomato)' },
  { id: 'amiibos', label: 'Amiibos', icon: <Gamepad2 size={22} />, c: 'var(--k-pink)' },
]

export default function Consola() {
  const h = useHome()
  return (
    <div className="k">
      <header className="k-top">
        <a className="k-brand" href="/">Mi vida</a>
        <nav className="k-apps" aria-label="Secciones">
          {APPS.map((a) => (
            <a key={a.id} href={`/#${a.id}`} style={{ '--c': a.c } as CSSProperties}>
              <span className="k-app-icon">{a.icon}</span>
              <span>{a.label}</span>
            </a>
          ))}
        </nav>
        <SyncPill className="k-pill" />
      </header>

      <main className="k-grid">
        <Hello h={h} />
        <Weather h={h} />
        <Releases h={h} />
        <MoneyTile h={h} />
        <Week h={h} />
        <Shelf h={h} />
        <MailTile h={h} />
      </main>
    </div>
  )
}

function Tile({ k, id, className = '', title, note, children }: { k: number; id?: SectionId; className?: string; title?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className={`k-tile ${className}`} style={{ '--i': k } as CSSProperties}>
      {title && (
        <div className="k-tile-head">
          <h2>{title}</h2>
          {note && <span className="k-note">{note}</span>}
          {id && <a className="k-open" href={`/#${id}`} aria-label={`Abrir ${title}`}>Abrir</a>}
        </div>
      )}
      {children}
    </section>
  )
}

function Hello({ h }: { h: HomeData }) {
  const { now } = h
  return (
    <Tile k={0} className="k-hello">
      <p className="k-date">{capitalize(now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }))}</p>
      <div className="k-clock" aria-label={`Son las ${hhmm(now)}`}>{hhmm(now)}</div>
      <h1 className="k-greet">{greeting(now.getHours())}</h1>
      <p className="k-summary">{summary(h).join(' ')}</p>
      {h.later.length > 0 && (
        <ul className="k-later">
          {h.later.slice(0, 3).map((e) => (
            <li key={e.id} style={{ '--c': e.color } as CSSProperties}><b>{hhmm(e.start)}</b>{e.title}</li>
          ))}
        </ul>
      )}
    </Tile>
  )
}

function Weather({ h }: { h: HomeData }) {
  const { f, now } = h
  if (!f) return <Tile k={1} className="k-sun" title="El tiempo"><p className="k-empty">Cargando el tiempo…</p></Tile>
  const day = f.days[0]
  const hours = f.hours.filter((x) => x.time > now).slice(0, 8)
  const lo = Math.min(...hours.map((x) => x.temp)), hi = Math.max(...hours.map((x) => x.temp))
  return (
    <button className="k-tile k-sun k-press" style={{ '--i': 1 } as CSSProperties} onClick={() => open('weather')} aria-label="Abrir el tiempo">
      <div className="k-wx-top">
        <span className="k-wx-icon" aria-hidden>{wmoIcon(f.current.code, f.current.isDay)}</span>
        <div className="k-temp">{Math.round(f.current.temp)}°</div>
      </div>
      <div className="k-cond">{wmoText(f.current.code)} en Madrid</div>
      <div className="k-minmax">Máx {Math.round(day.max)}°, mín {Math.round(day.min)}°{day.rainProb >= 20 ? `, lluvia ${day.rainProb} %` : ''}</div>
      <div className="k-bars" aria-hidden>
        {hours.map((x) => (
          <span key={x.time.getTime()} style={{ '--v': hi === lo ? 0.6 : 0.25 + (0.75 * (x.temp - lo)) / (hi - lo) } as CSSProperties}>
            <b>{Math.round(x.temp)}°</b><i /><em>{x.time.getHours()}h</em>
          </span>
        ))}
      </div>
    </button>
  )
}

function Releases({ h }: { h: HomeData }) {
  const [first, ...rest] = h.upcoming
  if (!first)
    return (
      <Tile k={2} id="games" className="k-tomato k-rel" title="Por salir">
        <p className="k-empty">Apunta en Juegos algo que aún no haya salido y aquí tendrás la cuenta atrás.</p>
      </Tile>
    )
  const c = countdown(first.released, first.tba)
  return (
    <Tile k={2} id="games" className="k-tomato k-rel" title="Por salir">
      <a className="k-rel-main" href="/#games">
        <div className="k-box"><Poster g={first} /></div>
        <div className="k-rel-text">
          <div className="k-count">{c.n != null && <b>{c.n}</b>}<span>{c.n != null ? c.u : c.u}</span></div>
          <div className="k-rel-name">{first.name}</div>
          <div className="k-rel-date">{first.released && !first.tba ? fmtDay(first.released) : 'Fecha por anunciar'}{first.platforms?.length ? `, en ${first.platforms.slice(0, 2).join(' y ')}` : ''}</div>
        </div>
      </a>
      {rest.length > 0 && (
        <ol className="k-rel-list">
          {rest.slice(0, 4).map((g) => {
            const x = countdown(g.released, g.tba)
            return (
              <li key={g.id}>
                <a href="/#games">
                  <span className="k-mini-box"><Poster g={g} /></span>
                  <span className="k-rel-li-name">{g.name}</span>
                  <span className="k-rel-li-when">{x.n != null ? `${x.n} ${x.u}` : x.u}</span>
                </a>
              </li>
            )
          })}
        </ol>
      )}
    </Tile>
  )
}

function MoneyTile({ h }: { h: HomeData }) {
  const { worth, flow, month, pf, hasData } = h.money
  const t = pf.totals
  const spent = flow.income ? Math.min(1, flow.expense / flow.income) : flow.expense ? 1 : 0
  const movers = pf.positions.filter((p) => p.dayPct != null).sort((a, b) => Math.abs(b.dayPct!) - Math.abs(a.dayPct!)).slice(0, 3)
  return (
    <Tile k={3} id="finance" className="k-mint k-money" title="Dinero">
      {!hasData ? (
        <p className="k-empty">Importa los movimientos de tus bancos en Dinero para ver aquí el mes.</p>
      ) : (
        <>
          <div className="k-worth"><Money v={worth.total} decimals={0} /></div>
          <div className="k-sub">Patrimonio neto</div>
          {t && (
            <div className={`k-day ${t.day >= 0 ? 'up' : 'down'}`}>
              {t.day >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              <Money v={t.day} sign decimals={0} /> hoy en bolsa <small>{pct(t.dayPct)}</small>
            </div>
          )}
          {movers.length > 0 && (
            <ul className="k-movers">
              {movers.map((p) => (
                <li key={p.holding.id}>
                  <Logo isin={p.holding.isin} name={p.holding.name} />
                  <span>{p.holding.name}</span>
                  <b className={p.dayPct! >= 0 ? 'up' : 'down'}>{pct(p.dayPct!)}</b>
                </li>
              ))}
            </ul>
          )}
          {flow.expense > 0 && (
            <div className="k-spent">
              <div className="k-spent-bar" aria-hidden><i style={{ width: `${spent * 100}%` }} /></div>
              <div className="k-spent-text">Gastado en {month}: <b><Money v={flow.expense} decimals={0} /></b>{flow.income > 0 && <> de <Money v={flow.income} decimals={0} /></>}</div>
            </div>
          )}
        </>
      )}
    </Tile>
  )
}

function Week({ h }: { h: HomeData }) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(h.from.getTime() + i * 86400_000))
  return (
    <Tile k={4} id="calendar" className="k-cal k-week" title="Esta semana">
      <div className="k-days">
        {days.map((d, i) => {
          const items = h.events.filter((e) => sameDay(e.start, d) || (e.start < d && e.end > d))
          const wx = h.f?.days.find((x) => sameDay(x.date, d))
          return (
            <div key={i} className={`k-day-col ${i === 0 ? 'today' : ''}`}>
              <div className="k-day-head">
                <span>{i === 0 ? 'Hoy' : d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')}</span>
                <b>{d.getDate()}</b>
                {wx && <em>{wmoIcon(wx.code)} {Math.round(wx.max)}°</em>}
              </div>
              {items.slice(0, 3).map((e) => (
                <div key={e.id} className="k-ev" style={{ '--c': e.color } as CSSProperties}>
                  {!e.allDay && <b>{hhmm(e.start)}</b>}<span>{e.title}</span>
                </div>
              ))}
              {items.length > 3 && <div className="k-more">y {items.length - 3} más</div>}
              {!items.length && <div className="k-free">Libre</div>}
            </div>
          )
        })}
      </div>
    </Tile>
  )
}

function Shelf({ h }: { h: HomeData }) {
  const { owned, total, wish, latest } = h.amiibos
  const p = total ? owned / total : 0
  return (
    <Tile k={5} id="amiibos" className="k-pink k-shelf" title="Amiibos"
      note={<>{owned} de {total || '…'}{wish ? `, ${wish} deseados` : ''}</>}>
      {latest.length ? (
        <div className="k-figs">
          {latest.map((a, i) => <img key={a.id} src={a.image} alt={a.name} title={a.name} loading="lazy" style={{ '--j': i } as CSSProperties} />)}
        </div>
      ) : (
        <p className="k-empty">Marca en Amiibos los que tienes y aparecerán aquí.</p>
      )}
      <div className="k-pct">
        <b>{Math.round(p * 100)} %</b> de la colección
        <div className="k-pct-bar" role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Colección completada"><i style={{ width: `${p * 100}%` }} /></div>
      </div>
    </Tile>
  )
}

function MailTile({ h }: { h: HomeData }) {
  const { google: g, inbox } = h
  return (
    <Tile k={6} className="k-mail" title="Correo" note={g.connected && inbox.unread > 0 ? `${inbox.unread} sin leer` : undefined}>
      {!g.configured ? (
        <p className="k-empty">Añade VITE_GOOGLE_CLIENT_ID para ver aquí tu correo.</p>
      ) : !g.connected ? (
        <button className="k-pill solid" onClick={g.connect}><Mail size={14} /> Conectar Google</button>
      ) : inbox.error ? (
        <p className="k-empty">{inbox.error}</p>
      ) : (
        <ul className="k-mails">
          {inbox.mails.slice(0, 4).map((m) => (
            <li key={m.id} className={m.unread ? 'unread' : ''}>
              <a href={m.link} target="_blank" rel="noreferrer">
                <span className="k-av" aria-hidden>{m.from.charAt(0).toUpperCase()}</span>
                <span className="k-mail-text"><b>{m.from}</b><span>{m.subject}</span></span>
                <time>{sameDay(m.date, new Date()) ? hhmm(m.date) : m.date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</time>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  )
}
