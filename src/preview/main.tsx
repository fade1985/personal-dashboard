import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { useGoogle } from '../lib/google'
import { GoogleCtx } from '../lib/nav'
import { useAutoSync } from '../lib/sync'
import HomeNext from './HomeNext'
import '../styles.css'
import './next.css'

function Preview() {
  const google = useGoogle()
  useAutoSync(google.connected)
  return (
    <GoogleCtx.Provider value={google}>
      <HomeNext />
    </GoogleCtx.Provider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
)
