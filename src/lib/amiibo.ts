// Catálogo de AmiiboAPI (https://www.amiiboapi.org), cacheado en localStorage.

import { readStore, writeStore } from './storage'

export interface Amiibo {
  id: string // head + tail
  name: string
  character: string
  series: string // amiiboSeries
  gameSeries: string
  type: string // Figure | Card | Yarn | Band
  image: string
  releaseEU?: string
  release?: string // la fecha más temprana conocida
}

export type Status = 'owned' | 'wishlist'

export interface OwnedInfo {
  status: Status
  boxed?: boolean // en caja (NIB)
  notes?: string
  price?: number
  addedAt: string
}

export type Collection = Record<string, OwnedInfo>

const CACHE_KEY = 'amiibo-catalog'
const CACHE_TTL = 7 * 24 * 3600 * 1000

interface RawAmiibo {
  amiiboSeries: string
  character: string
  gameSeries: string
  head: string
  tail: string
  image: string
  name: string
  type: string
  release: Record<string, string | null>
}

export async function loadCatalog(force = false): Promise<Amiibo[]> {
  const cached = readStore<{ at: number; items: Amiibo[] } | null>(CACHE_KEY, null)
  if (!force && cached && Date.now() - cached.at < CACHE_TTL) return cached.items
  try {
    const res = await fetch('https://www.amiiboapi.org/api/amiibo/')
    if (!res.ok) throw new Error(`AmiiboAPI ${res.status}`)
    const j: { amiibo: RawAmiibo[] } = await res.json()
    const items = j.amiibo.map<Amiibo>((a) => {
      const dates = Object.values(a.release ?? {}).filter(Boolean).sort() as string[]
      return {
        id: a.head + a.tail,
        name: a.name,
        character: a.character,
        series: a.amiiboSeries,
        gameSeries: a.gameSeries,
        type: a.type,
        image: a.image,
        releaseEU: a.release?.eu ?? undefined,
        release: dates[0],
      }
    })
    writeStore(CACHE_KEY, { at: Date.now(), items })
    return items
  } catch (e) {
    if (cached) return cached.items // sin red: usamos lo que haya
    throw e
  }
}
