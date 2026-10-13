import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { z } from 'zod'
import { clearInbox, waitForLoginCode, waitForResetLink } from './mailpit.ts'

const RESET_USER = 'reset@holidays.test'
// Email inesistente: la risposta è identica, nessuna email parte
const UNKNOWN_USER = 'nessuno@holidays.test'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const COLOR_SCHEMES: Array<'light' | 'dark'> = ['light', 'dark']

const expectNoViolations = async (page: Page): Promise<void> => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  const violations = results.violations.map(
    (violation) => `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  )
  expect(violations).toEqual([])
}

const expectNoViolationsInBothSchemes = async (page: Page): Promise<void> => {
  for (const colorScheme of COLOR_SCHEMES) {
    await page.emulateMedia({ colorScheme })
    const html = page.locator('html')
    if (colorScheme === 'dark') await expect(html).toHaveClass(/\bdark\b/)
    else await expect(html).not.toHaveClass(/\bdark\b/)
    await expectNoViolations(page)
  }
}

test.beforeEach(async () => {
  await clearInbox()
})

test('a user resets the password from the emailed link and enters with the emailed code', async ({ page, browser }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(RESET_USER)
  await page.getByRole('link', { name: 'Password dimenticata?' }).click()
  await expect(page.getByRole('heading', { name: 'Password dimenticata?' })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue(RESET_USER)

  await page.getByRole('button', { name: 'Invia il link' }).click()
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()

  const link = await waitForResetLink(RESET_USER)
  // Da qui in poi nella casella arrivano solo l'avviso di cambio password e il codice
  await clearInbox()
  const newPassword = `nuova-frase-segreta-${Date.now()}`
  await page.goto(link)
  await expect(page.getByLabel('Email')).toHaveValue(RESET_USER)
  await page.getByLabel('Nuova password').fill(newPassword)
  await page.getByLabel('Conferma password').fill(newPassword)
  await page.getByRole('button', { name: 'Salva la password' }).click()

  // Il reset non apre la sessione: si passa subito al codice, con l'avviso della password aggiornata
  await expect(page).toHaveURL(/\/login\/verify$/)
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()
  await expect(page.getByText('Password aggiornata. Per entrare inserisci il codice che ti abbiamo inviato.')).toBeVisible()
  await expectNoViolationsInBothSchemes(page)
  await page.getByLabel('Codice di verifica').fill(await waitForLoginCode(RESET_USER))
  await expect(page.getByRole('heading', { name: 'Ciao, Paolo' })).toBeVisible()

  // Il link funziona una sola volta: lo si riapre da ospite in un browser nuovo
  const guest = await browser.newContext({ baseURL: new URL(page.url()).origin, locale: 'it-IT' })
  try {
    const guestPage = await guest.newPage()
    await guestPage.goto(link)
    await guestPage.getByLabel('Nuova password').fill(`${newPassword}-bis`)
    await guestPage.getByLabel('Conferma password').fill(`${newPassword}-bis`)
    await guestPage.getByRole('button', { name: 'Salva la password' }).click()
    await expect(guestPage.getByRole('heading', { name: 'Link non valido' })).toBeVisible()
  } finally {
    await guest.close()
  }
})

test('password recovery pages have no WCAG violations in light and dark mode', async ({ page }) => {
  await page.goto('/forgot-password')
  await expect(page.getByRole('heading', { name: 'Password dimenticata?' })).toBeVisible()
  await expectNoViolationsInBothSchemes(page)

  await page.getByLabel('Email').fill(UNKNOWN_USER)
  await page.getByRole('button', { name: 'Invia il link' }).click()
  await expect(page.getByRole('heading', { name: 'Controlla la tua email' })).toBeVisible()
  await expectNoViolationsInBothSchemes(page)

  await page.goto(`/reset-password/token-finto?email=${encodeURIComponent(UNKNOWN_USER)}`)
  await expect(page.getByRole('heading', { name: 'Scegli una nuova password' })).toBeVisible()
  await expectNoViolationsInBothSchemes(page)

  await page.getByLabel('Nuova password').fill('una-frase-lunga-qualsiasi')
  await page.getByLabel('Conferma password').fill('una-frase-lunga-qualsiasi')
  await page.getByRole('button', { name: 'Salva la password' }).click()
  await expect(page.getByRole('heading', { name: 'Link non valido' })).toBeVisible()
  await expectNoViolationsInBothSchemes(page)
})

test('access pages fit a phone screen without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  const paths = ['/login', '/forgot-password', `/reset-password/token-finto?email=${encodeURIComponent(UNKNOWN_USER)}`, '/reset-password/token-finto']
  for (const path of paths) {
    await page.goto(path)
    await expect(page.locator('#page-title')).toBeVisible()
    // Espressione come stringa: le spec girano con il tsconfig di Node, senza i tipi del DOM
    const overflow = z.number().parse(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth'))
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
})

test('password recovery works with the keyboard only', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').focus()
  await page.keyboard.type(UNKNOWN_USER)
  // email → password → mostra password → "Password dimenticata?"
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Password dimenticata?' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Password dimenticata?' })).toBeVisible()
  await expect(page.getByLabel('Email')).toHaveValue(UNKNOWN_USER)
})
