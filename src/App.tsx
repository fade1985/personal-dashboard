import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  CalendarDays, CloudSun, Dumbbell, Gamepad2, Home as HomeIcon, Joystick, Landmark, LogIn, LogOut, Sparkles, Utensils, Brush, Settings,
} from 'lucide-react'
import { useGoogle } from './lib/google'
import { GoogleCtx, SECTION_COLOR, go, useGoogleCtx, type SectionId } from './lib/nav'
import Home from './sections/Home'
import CalendarSection from './sections/CalendarSection'
import WeatherSection from './sections/WeatherSection'
import Amiibos from './sections/Amiibos'
import Finance from './sections/Finance'
import Games from './sections/Games'

const NAV: { id: SectionId; label: string; icon: ReactNode }[] = [
  { id: 'home', label: 'Inicio', icon: <HomeIcon size={17} /> },
  { id: 'calendar', label: 'Calendario', icon: <CalendarDays size={17} /> },
  { id: 'weather', label: 'El tiempo', icon: <CloudSun size={17} /> },
  { id: 'finance', label: 'Bancos y gastos', icon: <Landmark size={17} /> },
  { id: 'games', label: 'Juegos', icon: <Joystick size={17} /> },
  { id: 'amiibos', label: 'Amiibos', icon: <Gamepad2 size={17} /> },
]

const SOON = [
  { label: 'Gym', icon: <Dumbbell size={17} />, c: '#f97316' },
  { label: 'Recetas', icon: <Utensils size={17} />, c: '#facc15' },
  { label: 'Tareas del hogar', icon: <Brush size={17} />, c: '#2dd4bf' },
]

function currentHash(): SectionId {
  const h = location.hash.slice(1) as SectionId
  return NAV.some((n) => n.id === h) ? h : 'home'
}

export default function App() {
  const google = useGoogle()
  const [section, setSection] = useState<SectionId>(currentHash)

  useEffect(() => {
    const on = () => {
      setSection(currentHash())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  return (
    <GoogleCtx.Provider value={google}>
      <div className="bg" aria-hidden>
        <div className="blob b1" />
        <div className="blob b2" />
        <div className="blob b3" />
        <div className="gridlines" />
      </div>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-logo"><Sparkles size={19} color="#0b0d17" /></div>
            <div>
              <div className="brand-name">Mi vida</div>
              <div className="brand-sub">Panel personal</div>
            </div>
          </div>
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${section === n.id ? 'active' : ''}`}
              style={{ '--c': SECTION_COLOR[n.id] } as CSSProperties}
              onClick={() => go(n.id)}
            >
              <span className="nav-icon">{n.icon}</span> {n.label}
            </button>
          ))}
          <div className="nav-label">Próximamente</div>
          {SOON.map((s) => (
            <button key={s.label} className="nav-item" disabled style={{ '--c': s.c } as CSSProperties}>
              <span className="nav-icon">{s.icon}</span> {s.label} <span className="soon">pronto</span>
            </button>
          ))}
          <div className="sidebar-foot">
            <GoogleButton />
          </div>
        </aside>
        <main className="main" key={section}>
          {section === 'home' && <Home />}
          {section === 'calendar' && <CalendarSection />}
          {section === 'weather' && <WeatherSection />}
          {section === 'finance' && <Finance />}
          {section === 'games' && <Games />}
          {section === 'amiibos' && <Amiibos />}
        </main>
      </div>
    </GoogleCtx.Provider>
  )
}

function GoogleButton() {
  const g = useGoogleCtx()
  const head = (
    <div className="row" style={{ gap: 8, marginBottom: 10 }}>
      <GoogleLogo />
      <span style={{ fontWeight: 600, fontSize: 13 }}>Google</span>
      <span className="spacer" />
      <span
        className={`dot ${g.connected ? 'live' : ''}`}
        style={{ background: g.connected ? 'var(--green)' : 'var(--faint)' }}
      />
    </div>
  )
  if (!g.configured)
    return (
      <>
        {head}
        <div className="faint" style={{ fontSize: 12, lineHeight: 1.45 }}>
          <Settings size={12} style={{ verticalAlign: -2 }} /> Añade <code>VITE_GOOGLE_CLIENT_ID</code> en <code>.env.local</code> para Calendar y Gmail.
        </div>
      </>
    )
  if (g.connected)
    return (
      <>
        {head}
        <div className="muted" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 8 }}>
          {g.email ?? 'Conectado'}
        </div>
        <button className="btn sm ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={g.disconnect}>
          <LogOut size={14} /> Desconectar
        </button>
      </>
    )
  return (
    <>
      {head}
      <button className="btn primary sm" style={{ width: '100%', justifyContent: 'center' }} onClick={g.connect}>
        <LogIn size={14} /> Conectar
      </button>
      {g.error && <div className="error" style={{ fontSize: 12, marginTop: 8 }}>{g.error}</div>}
    </>
  )
}

function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
