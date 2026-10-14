import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Prefisso '' per leggere anche le variabili non VITE_* (es. DEV_SERVER_PORT)
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.API_PROXY_TARGET || 'http://localhost'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    build: {
      rolldownOptions: {
        output: {
          // React e router in un chunk a parte: cambia solo quando si aggiornano le librerie, quindi resta in cache tra
          // un deploy e l'altro, e il chunk dell'app resta sotto la soglia di avviso
          codeSplitting: { groups: [{ name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/ }] },
        },
      },
    },
    server: {
      port: Number(env.DEV_SERVER_PORT) || 5173,
      strictPort: true,
      // Stessa origine per il browser: cookie di prima parte, niente CORS
      proxy: {
        '/api': { target: apiTarget },
        '/sanctum': { target: apiTarget },
      },
    },
  }
})
