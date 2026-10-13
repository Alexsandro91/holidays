import { expect, type Page } from '@playwright/test'
import { waitForLoginCode } from './mailpit.ts'

/** Login completo con il codice letto da Mailpit. La casella va svuotata prima, se serve un codice nuovo. */
export const signIn = async (page: Page, email: string, password: string): Promise<void> => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Continua' }).click()
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()
  await page.getByLabel('Codice di verifica').fill(await waitForLoginCode(email))
  await expect(page.getByRole('heading', { name: /^Ciao, / })).toBeVisible()
}
