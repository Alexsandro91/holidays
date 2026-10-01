import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { clearInbox, waitForLoginCode } from './mailpit.ts'

const ADMIN = { email: 'admin@holidays.test', password: 'holidays-dev-password' }
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const COLOR_SCHEMES: Array<'light' | 'dark'> = ['light', 'dark']

const expectNoViolations = async (page: Page): Promise<void> => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  // Nel messaggio anche i selettori degli elementi coinvolti, per trovarli subito
  const violations = results.violations.map(
    (violation) => `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  )
  expect(violations).toEqual([])
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

/** Cambia lo schema colori del sistema e attende che il tema (next-themes, "system") lo applichi. */
const applyColorScheme = async (page: Page, colorScheme: 'light' | 'dark'): Promise<void> => {
  await page.emulateMedia({ colorScheme })
  const html = page.locator('html')
  if (colorScheme === 'dark') await expect(html).toHaveClass(/\bdark\b/)
  else await expect(html).not.toHaveClass(/\bdark\b/)
}

/** Controllo axe sulla pagina corrente in chiaro e in scuro, senza ricaricarla (lo stato resta). */
const expectNoViolationsInBothSchemes = async (page: Page): Promise<void> => {
  for (const colorScheme of COLOR_SCHEMES) {
    await applyColorScheme(page, colorScheme)
    await expectNoViolations(page)
  }
}

test('public pages have no WCAG violations in light and dark mode', async ({ page }) => {
  for (const colorScheme of COLOR_SCHEMES) {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Accedi' })).toBeVisible()
    await applyColorScheme(page, colorScheme)
    await expectNoViolations(page)

    await page.goto('/non-esiste')
    await expect(page.getByRole('heading', { name: 'Pagina non trovata' })).toBeVisible()
    await applyColorScheme(page, colorScheme)
    await expectNoViolations(page)
  }
})

// Un solo login per la pagina del codice e la home: il limite è di 5 tentativi al minuto per email
test('code and home pages have no WCAG violations in light and dark mode', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(ADMIN.email)
  await page.getByLabel('Password', { exact: true }).fill(ADMIN.password)
  await page.getByRole('button', { name: 'Continua' }).click()
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()
  await expectNoViolationsInBothSchemes(page)

  await page.getByLabel('Codice di verifica').fill(await waitForLoginCode(ADMIN.email))
  await expect(page.getByRole('heading', { name: 'Ciao, Giulia' })).toBeVisible()
  await expectNoViolationsInBothSchemes(page)
})
