// Tienda de Steam (Vercel), para los juegos que no están en RAWG. Sin clave: es la API pública de la tienda.
//   /api/steam?search=another door → [{ steamId, name, image }]
//   /api/steam?app=1234560         → ficha: nombre, portada, fecha de salida, plataformas, géneros, Metacritic

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; mi-dashboard)', 'accept-language': 'en' }
const STORE = 'https://store.steampowered.com/api'

export const header = (id: number) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** "12 Aug, 2025", "Aug 12, 2025" o "2025-08-12" → 2025-08-12. "Coming soon", "Q1 2026" o "2026" no son fechas exactas. */
export function steamDate(s: string): string | undefined {
  const t = s.trim().toLowerCase()
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (m) return t
  m = /^(\d{1,2}) ([a-z]{3})[a-z]*,? (\d{4})$/.exec(t) ?? null
  if (m) return ymd(m[3], m[2], m[1])
  m = /^([a-z]{3})[a-z]* (\d{1,2}),? (\d{4})$/.exec(t)
  if (m) return ymd(m[3], m[1], m[2])
  return undefined
}
const ymd = (y: string, mon: string, d: string) => {
  const i = MONTHS.indexOf(mon)
  return i < 0 ? undefined : `${y}-${String(i + 1).padStart(2, '0')}-${d.padStart(2, '0')}`
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA })
  if (!res.ok) throw new Error(`Steam ${res.status}`)
  return res.json() as Promise<T>
}

async function search(term: string) {
  type R = { items?: { type: string; id: number; name: string }[] }
  const r = await json<R>(`${STORE}/storesearch/?term=${encodeURIComponent(term)}&l=english&cc=ES`)
  return (r.items ?? []).filter((x) => x.type === 'app').slice(0, 8).map((x) => ({ steamId: x.id, name: x.name, image: header(x.id) }))
}

async function app(id: number) {
  type D = {
    success: boolean
    data?: {
      name: string; header_image?: string; release_date?: { coming_soon: boolean; date: string }
      platforms?: Record<string, boolean>; genres?: { description: string }[]; metacritic?: { score: number }
    }
  }
  const r = await json<Record<string, D>>(`${STORE}/appdetails?appids=${id}&l=english&cc=ES`)
  const d = r[id]?.data
  if (!r[id]?.success || !d) throw new Error('No está en Steam')
  const released = d.release_date ? steamDate(d.release_date.date) : undefined
  const names: Record<string, string> = { windows: 'PC', mac: 'macOS', linux: 'Linux' }
  return {
    steamId: id,
    name: d.name,
    image: d.header_image ?? header(id),
    released,
    tba: !released || undefined,
    platforms: Object.entries(d.platforms ?? {}).filter(([, v]) => v).map(([k]) => names[k] ?? k),
    genres: d.genres?.map((g) => g.description),
    metacritic: d.metacritic?.score,
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = url.searchParams.get('search')?.trim()
  const id = Number(url.searchParams.get('app'))
  try {
    if (q) return Response.json(await search(q.slice(0, 80)), { headers: { 'cache-control': 's-maxage=3600' } })
    if (Number.isInteger(id) && id > 0) return Response.json(await app(id), { headers: { 'cache-control': 's-maxage=3600, stale-while-revalidate=86400' } })
    return Response.json({ error: 'Falta ?search= o ?app=' }, { status: 400 })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 })
  }
}
