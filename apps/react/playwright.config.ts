import { defineConfig, devices } from '@playwright/test'

// Stessa porta del dev server (DEV_SERVER_PORT nel .env; 5174 finché ats occupa la 5173)
const port = Number(process.env.DEV_SERVER_PORT) || 5174

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
