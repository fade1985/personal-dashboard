import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawgKey = env.RAWG_KEY ?? ''
  return {
    plugins: [react()],
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
