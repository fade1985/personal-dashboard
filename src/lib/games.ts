// Videojuegos: los que me he pasado, los que quiero jugar y los que aún no han salido.
// Los datos (portada, plataformas, fecha) vienen de RAWG a través del proxy de Vite
// (/api/rawg), que añade la clave sin exponerla al navegador.

import { useEffect } from 'react'
import { readStore, usePersistentState, writeStore } from './storage'
import type { CalEvent } from './google'

declare const __RAWG__: boolean
export const rawgEnabled = __RAWG__

export type GameStatus = 'backlog' | 'playing' | 'done' | 'dropped'

export interface Game {
  id: string
  rawgId?: number
  slug?: string
  name: string
  image?: string
  released?: string // YYYY-MM-DD
  /** Sin fecha anunciada ("TBA"). */
  tba?: boolean
  platforms?: string[]
  genres?: string[]
  metacritic?: number
  status: GameStatus
  myPlatform?: string
  rating?: number // 1-5
  finishedAt?: string // YYYY-MM-DD
  hours?: number
  notes?: string
  addedAt: string
  /** Lo apunté antes de que saliera: hay que avisar cuando salga. */
  waiting?: boolean
}

export const STATUS_META: Record<GameStatus, { label: string; emoji: string; color: string }> = {
  backlog: { label: 'Quiero jugar', emoji: '🎯', color: '#60a5fa' },
  playing: { label: 'Jugando', emoji: '🕹️', color: '#f59e0b' },
  done: { label: 'Pasado', emoji: '🏆', color: '#4ade80' },
  dropped: { label: 'Abandonado', emoji: '💤', color: '#94a3b8' },
}

export const RELEASE_COLOR = '#e879f9'

export const useGames = () => usePersistentState<Game[]>('games', [])

export const todayYmd = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const isUpcoming = (g: Game, today = todayYmd()) => Boolean(g.tba || !g.released || g.released > today)

/** Días que faltan para el lanzamiento (0 = hoy). */
export function daysUntil(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 86400_000)
}

/** Portadas de RAWG más ligeras (recorte 600x400 en su CDN). */
export const cover = (url?: string) => url?.replace('/media/games/', '/media/crop/600/400/games/')

// ---------- RAWG ----------

interface RawgGame {
  id: number
  slug: string
  name: string
  released: string | null
  tba: boolean
  background_image: string | null
  metacritic: number | null
  platforms?: { platform: { name: string } }[] | null
  genres?: { name: string }[]
}

export type GameInfo = Pick<Game, 'rawgId' | 'slug' | 'name' | 'image' | 'released' | 'tba' | 'platforms' | 'genres' | 'metacritic'>

const toInfo = (g: RawgGame): GameInfo => ({
  rawgId: g.id,
  slug: g.slug,
  name: g.name,
  image: g.background_image ?? undefined,
  released: g.released ?? undefined,
  tba: g.tba || undefined,
  platforms: g.platforms?.map((p) => p.platform.name),
  genres: g.genres?.map((x) => x.name),
  metacritic: g.metacritic ?? undefined,
})

async function rawg<T>(path: string): Promise<T> {
  const res = await fetch(`/api/rawg${path}`)
  if (res.status === 401 || res.status === 403) throw new Error('RAWG rechaza la clave: revisa RAWG_KEY en .env.local')
  if (!res.ok) throw new Error(`RAWG ${res.status}`)
  return res.json()
}

export async function searchGames(q: string): Promise<GameInfo[]> {
  const r = await rawg<{ results: RawgGame[] }>(`/games?search=${encodeURIComponent(q)}&page_size=10`)
  return r.results.map(toInfo)
}

export async function fetchGame(rawgId: number): Promise<GameInfo> {
  return toInfo(await rawg<RawgGame>(`/games/${rawgId}`))
}

/** Lanzamientos más esperados de los próximos meses (para descubrir). */
export async function upcomingReleases(): Promise<GameInfo[]> {
  const t = todayYmd()
  const end = new Date()
  end.setMonth(end.getMonth() + 6)
  const r = await rawg<{ results: RawgGame[] }>(`/games?dates=${t},${end.toISOString().slice(0, 10)}&ordering=-added&page_size=12`)
  return r.results.map(toInfo)
}

// ---------- Avisos de lanzamiento ----------

const CHECK_KEY = 'games-checked-at'

/**
 * Una vez al día vuelve a consultar en RAWG la fecha de los juegos que esperas
 * (las fechas cambian mucho) y lanza una notificación del navegador si alguno ya ha salido.
 */
export function useReleaseWatcher() {
  const [games, setGames] = useGames()

  useEffect(() => {
    if (!rawgEnabled) return
    const last = readStore<number>(CHECK_KEY, 0)
    if (Date.now() - last < 20 * 3600_000) return
    const watch = games.filter((g) => g.rawgId && g.status !== 'done' && g.status !== 'dropped' && (g.waiting || isUpcoming(g)))
    if (!watch.length) return
    writeStore(CHECK_KEY, Date.now())
    Promise.allSettled(watch.map((g) => fetchGame(g.rawgId!))).then((res) => {
      const fresh = new Map<number, GameInfo>()
      res.forEach((r) => r.status === 'fulfilled' && fresh.set(r.value.rawgId!, r.value))
      setGames((l) => l.map((g) => {
        const f = g.rawgId ? fresh.get(g.rawgId) : undefined
        return f ? { ...g, released: f.released, tba: f.tba, image: g.image ?? f.image, platforms: f.platforms ?? g.platforms } : g
      }))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const released = games.filter((g) => g.waiting && !isUpcoming(g))
  const key = released.map((g) => g.id).join()
  useEffect(() => {
    if (!released.length || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const shown = new Set(readStore<string[]>('games-notified', []))
    for (const g of released) {
      if (shown.has(g.id)) continue
      new Notification(`🎮 ¡Ya ha salido ${g.name}!`, { body: 'Lo tenías apuntado en tu dashboard', icon: cover(g.image) })
      shown.add(g.id)
    }
    writeStore('games-notified', [...shown])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { released, dismiss: (id: string) => setGames((l) => l.map((g) => (g.id === id ? { ...g, waiting: false } : g))) }
}

/** Lanzamientos de los juegos apuntados (no pasados ni abandonados) como eventos de calendario. */
export function releaseEvents(games: Game[], from: Date, to: Date): CalEvent[] {
  const out: CalEvent[] = []
  for (const g of games) {
    if (!g.released || g.tba || g.status === 'done' || g.status === 'dropped') continue
    const [y, m, d] = g.released.split('-').map(Number)
    const start = new Date(y, m - 1, d)
    if (start < from || start >= to) continue
    out.push({
      id: `game:${g.id}`,
      title: `Sale ${g.name}`,
      start,
      end: new Date(start.getTime() + 86400_000),
      allDay: true,
      color: RELEASE_COLOR,
      calendar: 'Lanzamientos',
      source: 'local',
      kind: 'release',
    })
  }
  return out
}
