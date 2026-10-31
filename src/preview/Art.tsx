// Portada vertical de un juego (Steam 600x900 o RAWG); si no hay imagen, una portada generada con el título.

import { useState, type CSSProperties } from 'react'
import { LogIn, RefreshCw } from 'lucide-react'
import type { Game } from '../lib/games'
import { useGoogleCtx } from '../lib/nav'
import { syncNow, useSyncStatus } from '../lib/sync'
import { hueOf } from './data'

const boxImage = (url?: string) => url?.replace('/media/games/', '/media/resize/640/-/games/')

export function posterUrl(g: Game) {
  return g.steamId ? `https://cdn.akamai.steamstatic.com/steam/apps/${g.steamId}/library_600x900.jpg` : boxImage(g.image)
}

export function Poster({ g, className = '' }: { g: Game; className?: string }) {
  const tall = g.steamId ? posterUrl(g) : undefined
  const [src, setSrc] = useState(tall ?? boxImage(g.image))
  const h = hueOf(g.name)
  if (!src)
    return (
      <div className={`art-fallback ${className}`} style={{ '--h': h } as CSSProperties} aria-hidden>
        <span>{g.name}</span>
      </div>
    )
  return <img className={className} src={src} alt="" loading="lazy" onError={() => setSrc(src === tall ? boxImage(g.image) : undefined)} />
}

/** Estado de Google y la sincronización con Drive, en una píldora. */
export function SyncPill({ className }: { className: string }) {
  const g = useGoogleCtx()
  const s = useSyncStatus()
  if (!g.configured) return null
  if (!g.connected) return <button className={className} onClick={g.connect}><LogIn size={14} /> Conectar Google</button>
  const label = s.kind === 'syncing' ? 'Sincronizando…' : s.kind === 'error' ? 'Error al sincronizar' : s.kind === 'off' ? 'Sin sincronizar' : 'Sincronizado'
  return (
    <button className={`${className} ${s.kind === 'error' ? 'err' : ''}`} onClick={() => (s.kind === 'off' ? g.connect() : syncNow())} title={s.kind === 'error' ? s.message : 'Sincronizar ahora'}>
      <RefreshCw size={13} className={s.kind === 'syncing' ? 'spin' : ''} /> {label}
    </button>
  )
}
