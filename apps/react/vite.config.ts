import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Prefisso '' per leggere anche le variabili non VITE_* (es. DEV_SERVER_PORT)
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    server: {
      port: Number(env.DEV_SERVER_PORT) || 5173,
      strictPort: true,
    },
  }
})
