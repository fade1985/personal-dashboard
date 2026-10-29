// Proxy de RAWG para producción (Vercel). Hace lo mismo que el proxy de vite.config.ts:
// /api/rawg/games?search=… → https://api.rawg.io/api/games?search=…&key=RAWG_KEY
// La ruta llega en ?path= gracias a la reescritura de vercel.json.

declare const process: { env: Record<string, string | undefined> }

export async function GET(request: Request) {
  const key = process.env.RAWG_KEY
  if (!key) return Response.json({ error: 'Falta RAWG_KEY en las variables de entorno' }, { status: 401 })

  const url = new URL(request.url)
  const path = url.searchParams.get('path') ?? ''
  // Solo endpoints de juegos: el proxy no debe servir para cualquier otra cosa
  if (!/^games(\/\d+)?$/.test(path)) return Response.json({ error: 'Ruta no permitida' }, { status: 400 })

  url.searchParams.delete('path')
  url.searchParams.set('key', key)
  const res = await fetch(`https://api.rawg.io/api/${path}?${url.searchParams}`)
  return new Response(res.body, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      // Las respuestas de RAWG cambian poco: caché en el CDN de Vercel para gastar menos cuota
      'cache-control': 's-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
