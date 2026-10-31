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
  /** Juegos que solo están en Steam */
  steamId?: number
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

export type GameInfo = Pick<Game, 'rawgId' | 'steamId' | 'slug' | 'name' | 'image' | 'released' | 'tba' | 'platforms' | 'genres' | 'metacritic'>

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

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

/**
 * Busca en RAWG. La búsqueda normal ordena por popularidad y los juegos pequeños se quedan fuera
 * de los 10 primeros ("Another Door" queda debajo de cien "Another…"), así que pedimos también la
 * coincidencia exacta y ponemos delante los títulos que coinciden con lo escrito.
 */
export async function searchGames(q: string): Promise<GameInfo[]> {
  const enc = encodeURIComponent(q)
  const [exact, precise] = await Promise.allSettled([
    rawg<{ results: RawgGame[] }>(`/games?search=${enc}&search_exact=true&page_size=10`),
    rawg<{ results: RawgGame[] }>(`/games?search=${enc}&search_precise=true&page_size=20`),
  ])
  if (exact.status === 'rejected' && precise.status === 'rejected') throw precise.reason
  const seen = new Set<number>()
  const all = [exact, precise].flatMap((r) => (r.status === 'fulfilled' ? r.value.results : []))
    .filter((g) => !seen.has(g.id) && seen.add(g.id))
  const n = norm(q)
  const rank = (g: RawgGame) => { const x = norm(g.name); return x === n ? 0 : x.startsWith(n) ? 1 : x.includes(n) ? 2 : 3 }
  return all.map((g, i) => ({ g, i, r: rank(g) })).sort((a, b) => a.r - b.r || a.i - b.i).slice(0, 15).map(({ g }) => toInfo(g))
}

export async function fetchGame(rawgId: number): Promise<GameInfo> {
  return toInfo(await rawg<RawgGame>(`/games/${rawgId}`))
}

// ---------- Steam (para lo que no está en RAWG) ----------

export interface SteamHit { steamId: number; name: string; image: string }

export async function searchSteam(q: string): Promise<SteamHit[]> {
  const r = await fetch(`/api/steam?search=${encodeURIComponent(q)}`)
  if (!r.ok) throw new Error(`Steam ${r.status}`)
  return r.json()
}

export async function fetchSteam(id: number): Promise<GameInfo> {
  const r = await fetch(`/api/steam?app=${id}`)
  const j = await r.json()
  if (!r.ok || j.error) throw new Error(j.error ?? `Steam ${r.status}`)
  return j as GameInfo
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
    const last = readStore<number>(CHECK_KEY, 0)
    if (Date.now() - last < 20 * 3600_000) return
    const watch = games.filter((g) => (rawgEnabled ? g.rawgId || g.steamId : g.steamId) && g.status !== 'done' && g.status !== 'dropped' && (g.waiting || isUpcoming(g)))
    if (!watch.length) return
    writeStore(CHECK_KEY, Date.now())
    Promise.allSettled(watch.map((g) => (g.rawgId ? fetchGame(g.rawgId) : fetchSteam(g.steamId!)).then((info) => [g.id, info] as const))).then((res) => {
      const fresh = new Map<string, GameInfo>()
      res.forEach((r) => r.status === 'fulfilled' && fresh.set(r.value[0], r.value[1]))
      setGames((l) => l.map((g) => {
        const f = fresh.get(g.id)
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
