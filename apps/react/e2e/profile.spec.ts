import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { z } from 'zod'
import { clearInbox, waitForLoginCode, waitForSubject } from './mailpit.ts'

// Utente dedicato (DevUserSeeder): la password e la lingua cambiano durante il test e tornano come prima alla fine
const PROFILE = 'profile@holidays.test'
const DEV_PASSWORD = 'holidays-dev-password'
const NEW_PASSWORD = 'una-frase-nuova-per-il-profilo'
const PASSWORD_CHANGED_SUBJECT = /La password di Holidays è stata cambiata|Your Holidays password was changed/
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const COLOR_SCHEMES: Array<'light' | 'dark'> = ['light', 'dark']

// Un solo login per i controlli della pagina, poi uno per il cambio password e uno per la lingua: il limite è di 5
// accessi al minuto per email e IP
test.describe.configure({ mode: 'serial' })

let context: BrowserContext | null = null
let page: Page

const expectNoViolations = async (): Promise<void> => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  const violations = results.violations.map(
    (violation) => `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  )
  expect(violations).toEqual([])
}

/**
 * Accesso con la prima password che funziona: un'esecuzione interrotta a metà può aver lasciato la nuova. La home può
 * essere in inglese se l'esecuzione interrotta ha lasciato l'account in inglese. Restituisce la password usata.
 */
const signInWithEither = async (passwords: string[]): Promise<string> => {
  for (const password of passwords) {
    // Casella vuota: il codice letto è quello di questo accesso
    await clearInbox()
    await page.goto('/login')
    await page.getByLabel('Email').fill(PROFILE)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Continua' }).click()
    const codePage = page.getByRole('heading', { name: 'Controlla la tua email' })
    const wrongPassword = page.getByText(/Email o password non corrette/)
    await expect(codePage.or(wrongPassword)).toBeVisible()
    if (await wrongPassword.isVisible()) continue
    await page.getByLabel('Codice di verifica').fill(await waitForLoginCode(PROFILE))
    await expect(page.getByRole('heading', { level: 1, name: /^(Ciao|Hi), Paolo$/ })).toBeVisible()
    return password
  }
  throw new Error(`Nessuna delle password note funziona per ${PROFILE}`)
}

const signOut = async (accountMenu: RegExp, signOutLabel: string): Promise<void> => {
  await page.getByRole('button', { name: accountMenu }).click()
  await page.getByRole('menuitem', { name: signOutLabel }).click()
  await expect(page).toHaveURL(/\/login\?reason=logged-out$/)
}

/** Cambio password dalla pagina Profilo (in italiano); attende l'email di avviso, poi la casella si svuota. */
const changePassword = async (current: string, next: string): Promise<void> => {
  await clearInbox()
  await page.goto('/profile')
  const card = page.getByRole('region', { name: 'Password' })
  await card.getByLabel('Password attuale').fill(current)
  await card.getByLabel('Nuova password').fill(next)
  await card.getByLabel('Conferma la nuova password').fill(next)
  await card.getByRole('button', { name: 'Cambia password' }).click()
  await expect(page.getByText('Password cambiata. Le altre sessioni sono state chiuse.')).toBeVisible()
  await expect(card.getByLabel('Password attuale')).toHaveValue('')
  await waitForSubject(PROFILE, PASSWORD_CHANGED_SUBJECT)
  await clearInbox()
}

/** Rimette l'italiano sull'account dalla pagina Profilo (i nomi delle lingue non cambiano con la lingua). */
const restoreItalian = async (): Promise<void> => {
  await page.goto('/profile')
  if ((await page.locator('html').getAttribute('lang')) === 'it') return
  await page.getByRole('radio', { name: 'Italiano' }).click()
  await expect(page.getByText('Lingua salvata.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Profilo' })).toBeVisible()
}

test.beforeAll(async ({ browser }) => {
  const baseURL = test.info().project.use.baseURL
  if (!baseURL) throw new Error('baseURL non configurato')
  context = await browser.newContext({ baseURL, locale: 'it-IT' })
  page = await context.newPage()
  const used = await signInWithEither([DEV_PASSWORD, NEW_PASSWORD])
  // Esecuzione precedente interrotta: prima si torna allo stato iniziale (italiano e password di sviluppo)
  await restoreItalian()
  if (used !== DEV_PASSWORD) await changePassword(used, DEV_PASSWORD)
})

test.afterAll(async () => {
  await context?.close()
})

test('the profile page has no WCAG violations in light and dark mode', async () => {
  await page.goto('/profile')
  await expect(page.getByRole('heading', { level: 1, name: 'Profilo' })).toBeVisible()
  await expect(page).toHaveTitle('Profilo · Holidays')
  for (const colorScheme of COLOR_SCHEMES) {
    await page.emulateMedia({ colorScheme })
    const html = page.locator('html')
    if (colorScheme === 'dark') await expect(html).toHaveClass(/\bdark\b/)
    else await expect(html).not.toHaveClass(/\bdark\b/)
    await expectNoViolations()
  }
  await page.emulateMedia({ colorScheme: 'light' })
})

test('the profile page fits a phone screen without horizontal scrolling', async () => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/profile')
  await expect(page.getByRole('heading', { level: 1, name: 'Profilo' })).toBeVisible()
  // Espressione come stringa: le spec girano con il tsconfig di Node, senza i tipi del DOM
  const overflow = z.number().parse(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth'))
  expect(overflow).toBeLessThanOrEqual(0)
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('changes the password, signs in again with the new one and puts the old one back', async () => {
  await changePassword(DEV_PASSWORD, NEW_PASSWORD)

  await signOut(/Menu account/, 'Esci')
  await expect(page.getByText('Sei uscito. A presto.')).toBeVisible()
  // Solo la nuova: la vecchia non deve più funzionare, ma provarla consumerebbe un accesso del limite al minuto
  expect(await signInWithEither([NEW_PASSWORD])).toBe(NEW_PASSWORD)

  await changePassword(NEW_PASSWORD, DEV_PASSWORD)
})

test('keeps the language of the account after signing out and in again', async () => {
  await page.goto('/profile')
  await page.getByRole('radio', { name: 'English' }).click()
  await expect(page.getByText('Language saved.')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Profile' })).toBeVisible()

  await signOut(/Account menu/, 'Sign out')
  // Come su un altro dispositivo: il browser torna all'italiano, la lingua deve arrivare dall'account
  await page.evaluate("window.localStorage.removeItem('holidays-locale')")
  await signInWithEither([DEV_PASSWORD])
  await expect(page.getByRole('heading', { level: 1, name: 'Hi, Paolo' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')

  await restoreItalian()
})
