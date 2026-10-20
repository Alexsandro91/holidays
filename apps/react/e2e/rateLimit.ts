import type { Page } from '@playwright/test'

/** Soglie di richieste API ancora disponibili (finestra di 60 al minuto per utente) prima di un passo leggero, normale o pesante. */
export const BUDGET_LIGHT = 20
export const BUDGET_STANDARD = 30
export const BUDGET_HEAVY = 40

const WINDOW_MS = 61_000

// Richieste API ancora disponibili per pagina, lette dall'intestazione `X-RateLimit-Remaining` delle risposte
const remaining = new Map<Page, number>()

/** Da chiamare una volta per pagina, prima del login: da quel momento ogni risposta aggiorna il residuo. */
export const trackRateLimit = (page: Page): void => {
  page.on('response', (response) => {
    const value = Number(response.headers()['x-ratelimit-remaining'])
    if (response.url().includes('/api/') && Number.isFinite(value)) remaining.set(page, value)
  })
}

/**
 * Prima di un passo che fa molte letture: se il residuo è sotto `needed` aspetta che la finestra si rinnovi
 * e rilegge il residuo con una lettura leggera; altrimenti non aspetta. Senza letture precedenti non fa nulla.
 */
export const ensureBudget = async (page: Page, needed = BUDGET_STANDARD): Promise<void> => {
  const left = remaining.get(page)
  if (left === undefined || left >= needed) return
  await page.waitForTimeout(WINDOW_MS)
  const response = await page.request.get('/api/auth/user', { headers: { Accept: 'application/json' } })
  const value = Number(response.headers()['x-ratelimit-remaining'])
  if (Number.isFinite(value)) remaining.set(page, value)
  else remaining.delete(page)
}
