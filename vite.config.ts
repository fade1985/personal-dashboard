import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawgKey = env.RAWG_KEY ?? ''
  return {
    plugins: [
      react(),
      {
        // En desarrollo, /api/quote lo sirve la misma función que en Vercel
        name: 'api-quote',
        configureServer(server) {
          server.middlewares.use('/api/quote', async (req, res) => {
            const mod = await server.ssrLoadModule('/api/quote.ts')
            const out: Response = await mod.GET(new Request(`http://localhost${req.originalUrl}`))
            res.statusCode = out.status
            res.setHeader('content-type', 'application/json')
            res.end(await out.text())
          })
        },
      },
    ],
    // Dos páginas: el dashboard (index.html) y la propuesta de diseño de Inicio (preview.html)
    build: { rollupOptions: { input: { main: 'index.html', preview: 'preview.html' } } },
    // El navegador solo ve si hay clave, nunca la clave
    define: { __RAWG__: JSON.stringify(Boolean(rawgKey)) },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        // /api/rawg/games?search=… → https://api.rawg.io/api/games?search=…&key=…
        '/api/rawg': {
          target: 'https://api.rawg.io',
          changeOrigin: true,
          rewrite: (path) => {
            const p = path.replace(/^\/api\/rawg/, '/api')
            return `${p}${p.includes('?') ? '&' : '?'}key=${encodeURIComponent(rawgKey)}`
          },
        },
      },
    },
  }
})
