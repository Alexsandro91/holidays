import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

// Stessa porta del dev server: DEV_SERVER_PORT letto come in vite.config.ts (.env, sovrascrivibile dall'ambiente)
const env = loadEnv('development', process.cwd(), '')
const port = Number(env.DEV_SERVER_PORT) || 5173

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    locale: 'it-IT',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
