import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { clearInbox, waitForLoginCode } from './mailpit.ts'

const ADMIN = { email: 'admin@holidays.test', password: 'holidays-dev-password' }
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const COLOR_SCHEMES: Array<'light' | 'dark'> = ['light', 'dark']

const expectNoViolations = async (page: Page): Promise<void> => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
}

test.beforeEach(async () => {
  await clearInbox()
})

test('an admin signs in with the emailed code and signs out', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login\?redirect=%2F$/)

  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Continua' }).click()
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()

  await page.getByLabel('Codice di verifica').fill(await waitForLoginCode(ADMIN.email))
  await expect(page.getByRole('heading', { name: 'Ciao, Giulia' })).toBeVisible()
  await expect(page).toHaveTitle('Home · Holidays')

  await page.getByRole('button', { name: /Menu account/ }).click()
  await page.getByRole('menuitem', { name: 'Esci' }).click()
  await expect(page.getByText('Sei uscito. A presto.')).toBeVisible()
})

test('sign-in works with the keyboard only', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').focus()
  await page.keyboard.type(ADMIN.email)
  await page.keyboard.press('Tab')
  await page.keyboard.type(ADMIN.password)
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()

  // Il campo del codice riceve il focus da solo
  await page.keyboard.type(await waitForLoginCode(ADMIN.email))
  await expect(page.getByRole('heading', { name: 'Ciao, Giulia' })).toBeVisible()
})

test('sign-in pages have no WCAG violations in light and dark mode', async ({ page }) => {
  for (const colorScheme of COLOR_SCHEMES) {
    await page.emulateMedia({ colorScheme })
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Accedi' })).toBeVisible()
    await expectNoViolations(page)
  }

  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Continua' }).click()
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()
  await expectNoViolations(page)
})
