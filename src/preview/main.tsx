import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useGoogle } from '../lib/google'
import { GoogleCtx } from '../lib/nav'
import { useAutoSync } from '../lib/sync'
import HomeNext from './HomeNext'
import Consola from './Consola'
import Escaparate from './Escaparate'
import '../styles.css'
import './next.css'
import './consola.css'
import './escaparate.css'

// Propuestas de diseño de Inicio, con tus datos. Se elige con el selector de abajo (o ?v= en la dirección).
const VERSIONS = [
  { id: 'consola', label: 'Consola', C: Consola },
  { id: 'escaparate', label: 'Escaparate', C: Escaparate },
  { id: 'ventana', label: 'Ventana', C: HomeNext },
] as const
type V = (typeof VERSIONS)[number]['id']

const initial = (): V => {
  const v = new URLSearchParams(location.search).get('v')
  return VERSIONS.some((x) => x.id === v) ? (v as V) : 'consola'
}

function Preview() {
  const google = useGoogle()
  useAutoSync(google.connected)
  const [v, setV] = useState<V>(initial)
  const { C } = VERSIONS.find((x) => x.id === v)!
  const pick = (id: V) => {
    setV(id)
    history.replaceState(null, '', `?v=${id}`)
    window.scrollTo({ top: 0 })
  }
  return (
    <GoogleCtx.Provider value={google}>
      <C key={v} />
      <div className="mk-switch" role="radiogroup" aria-label="Maqueta">
        {VERSIONS.map((x) => (
          <button key={x.id} role="radio" aria-checked={v === x.id} className={v === x.id ? 'on' : ''} onClick={() => pick(x.id)}>{x.label}</button>
        ))}
      </div>
    </GoogleCtx.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
