import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { z } from 'zod'
import { signIn } from './auth.ts'
import { clearInbox, waitForInvitationLink, waitForLoginCode, waitForSubject } from './mailpit.ts'

const ADMIN = 'admin@holidays.test'
const MANAGER = 'manager@holidays.test'
const EMPLOYEE = 'employee@holidays.test'
const PASSWORD = 'holidays-dev-password'
// L'account attivato non si può cancellare: a fine test resta disattivato nel database di sviluppo
const NEW_USER = `e2e-${Date.now()}@holidays.test`
const NEW_USER_NAME = 'E2E Invitato'
// Invitato come admin e annullato a fine test: non resta nel database
const NEW_ADMIN = `e2e-admin-${Date.now()}@holidays.test`
const NEW_ADMIN_NAME = 'E2E Amministratore'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const COLOR_SCHEMES: Array<'light' | 'dark'> = ['light', 'dark']

test.describe.configure({ mode: 'serial' })

const expectNoViolations = async (page: Page): Promise<void> => {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  const violations = results.violations.map(
    (violation) => `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`,
  )
  expect(violations).toEqual([])
}

/** Controllo axe in chiaro e in scuro senza ricaricare la pagina (lo stato resta). */
const expectNoViolationsInBothSchemes = async (page: Page): Promise<void> => {
  for (const colorScheme of COLOR_SCHEMES) {
    await page.emulateMedia({ colorScheme })
    const html = page.locator('html')
    if (colorScheme === 'dark') await expect(html).toHaveClass(/\bdark\b/)
    else await expect(html).not.toHaveClass(/\bdark\b/)
    await expectNoViolations(page)
  }
}

const horizontalOverflow = async (page: Page): Promise<number> =>
  // Espressione come stringa: le spec girano con il tsconfig di Node, senza i tipi del DOM
  z.number().parse(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth'))

const focusedLabel = async (page: Page): Promise<string | null> =>
  z.string().nullable().parse(await page.evaluate("document.activeElement?.getAttribute('aria-label') ?? null"))

let browserRef: Browser
let baseURL: string
let adminContext: BrowserContext | null = null
let admin: Page
let newUserContext: BrowserContext | null = null
let newUserPage: Page | null = null

const newContext = (): Promise<BrowserContext> => browserRef.newContext({ baseURL, locale: 'it-IT' })

test.beforeAll(async ({ browser }) => {
  browserRef = browser
  const configured = test.info().project.use.baseURL
  if (!configured) throw new Error('baseURL non configurato')
  baseURL = configured
  await clearInbox()
  // Un solo login admin per file: il limite è di 5 al minuto per email e IP
  const context = await newContext()
  adminContext = context
  admin = await context.newPage()
  await signIn(admin, ADMIN, PASSWORD)
})

test.afterAll(async () => {
  await newUserContext?.close()
  // beforeAll può fallire prima di aprire il contesto admin
  await adminContext?.close()
})

test('an admin invites a user who activates the account and enters with the code', async () => {
  await admin.goto('/users')
  await admin.getByRole('button', { name: 'Invita utente' }).click()
  const dialog = admin.getByRole('dialog', { name: 'Invita utente' })
  await dialog.getByLabel('Nome e cognome').fill(NEW_USER_NAME)
  await dialog.getByLabel('Email aziendale').fill(NEW_USER)
  await dialog.getByRole('button', { name: 'Invia invito' }).click()
  await expect(admin.getByText(`Invito inviato a ${NEW_USER}.`)).toBeVisible()

  const link = await waitForInvitationLink(NEW_USER)
  // Da qui nella casella del nuovo utente arriva solo il codice di accesso
  await clearInbox()

  newUserContext = await newContext()
  newUserPage = await newUserContext.newPage()
  await newUserPage.goto(link)
  await expect(newUserPage.getByRole('heading', { name: 'Benvenuto, E2E Invitato' })).toBeVisible()
  const password = `una-frase-unica-${Date.now()}`
  await newUserPage.getByLabel('Password', { exact: true }).fill(password)
  await newUserPage.getByLabel('Conferma password').fill(password)
  await newUserPage.getByLabel('Ho preso visione dell’informativa privacy').check()
  await newUserPage.getByRole('button', { name: 'Attiva account' }).click()

  await expect(newUserPage).toHaveURL(/\/login\/verify$/)
  await expect(newUserPage.getByText('Account attivato. Per entrare inserisci il codice che ti abbiamo inviato.')).toBeVisible()
  await newUserPage.getByLabel('Codice di verifica').fill(await waitForLoginCode(NEW_USER))
  await expect(newUserPage.getByRole('heading', { name: 'Ciao, E2E' })).toBeVisible()
})

test('an admin promotes and revokes another admin, every admin is warned', async () => {
  await admin.goto('/admin/administrators')
  await admin.getByRole('button', { name: 'Aggiungi admin' }).click()
  const grant = admin.getByRole('dialog', { name: 'Aggiungi un amministratore' })
  await grant.getByRole('searchbox', { name: 'Cerca un utente attivo' }).fill('E2E')
  await grant.getByRole('radio', { name: new RegExp(NEW_USER) }).check()
  await grant.getByLabel('La tua password').fill(PASSWORD)
  await grant.getByRole('button', { name: 'Rendi amministratore' }).click()
  await expect(admin.getByText(`${NEW_USER_NAME} ora è amministratore.`)).toBeVisible()
  await waitForSubject(NEW_USER, /nuovo amministratore/)

  await admin.getByRole('button', { name: `Revoca ${NEW_USER_NAME}` }).click()
  const revoke = admin.getByRole('alertdialog')
  await revoke.getByRole('radio', { name: 'Dipendente' }).check()
  await revoke.getByLabel('La tua password').fill(PASSWORD)
  await revoke.getByRole('button', { name: `Revoca ${NEW_USER_NAME}` }).click()
  await expect(admin.getByText(`${NEW_USER_NAME} non è più amministratore.`)).toBeVisible()
  await waitForSubject(NEW_USER, /revocato/)
})

test('disabling a user signs them out on the next request', async () => {
  // Cerca per email: gli utenti e2e-… delle esecuzioni precedenti hanno lo stesso nome
  await admin.goto(`/users?email=${encodeURIComponent(NEW_USER)}`)
  const row = admin.getByRole('row').filter({ hasText: NEW_USER })
  await row.getByRole('button', { name: `Azioni per ${NEW_USER_NAME}` }).click()
  await admin.getByRole('menuitem', { name: 'Disattiva' }).click()
  await admin.getByRole('alertdialog').getByRole('button', { name: `Disattiva ${NEW_USER_NAME}` }).click()
  await expect(admin.getByText(`${NEW_USER_NAME} è stato disattivato.`)).toBeVisible()

  if (!newUserPage) throw new Error('Il contesto del nuovo utente manca: il primo test non è arrivato in fondo')
  // Dopo il ricaricamento non c'è utente in cache: si finisce sull'accesso con la pagina di provenienza, senza avviso di sessione scaduta
  await newUserPage.reload()
  await expect(newUserPage).toHaveURL(/\/login\?redirect=%2F$/)
  await expect(newUserPage.getByRole('heading', { name: 'Accedi' })).toBeVisible()
})

test('admin pages have no WCAG violations in light and dark mode', async () => {
  await admin.goto('/users')
  await expect(admin.getByRole('heading', { name: 'Utenti', level: 1 })).toBeVisible()
  await expect(admin.getByRole('row').nth(1)).toBeVisible()
  await expectNoViolationsInBothSchemes(admin)

  await admin.getByRole('button', { name: 'Invita utente' }).click()
  const inviteDialog = admin.getByRole('dialog', { name: 'Invita utente' })
  await expect(inviteDialog).toBeVisible()
  // Animazione di apertura finita: axe non deve misurare i colori a metà dissolvenza
  await expect(inviteDialog).toHaveCSS('opacity', '1')
  await expectNoViolationsInBothSchemes(admin)
  await admin.keyboard.press('Escape')
  await expect(admin.getByRole('dialog')).toBeHidden()

  await admin.goto('/admin/administrators')
  await expect(admin.getByRole('heading', { name: 'Amministratori', level: 1 })).toBeVisible()
  // Solo nel contenuto: il nome c'è anche nel menu account, che basterebbe a far passare il controllo a lista vuota
  await expect(admin.getByRole('main').getByText('Giulia Rossi')).toBeVisible()
  await expectNoViolationsInBothSchemes(admin)

  await admin.getByRole('button', { name: 'Aggiungi admin' }).click()
  const grantDialog = admin.getByRole('dialog', { name: 'Aggiungi un amministratore' })
  await grantDialog.getByRole('radio', { name: 'Nuova persona' }).check()
  await expect(grantDialog.getByLabel('Nome e cognome')).toBeVisible()
  await expect(grantDialog).toHaveCSS('opacity', '1')
  await expectNoViolationsInBothSchemes(admin)
  await admin.keyboard.press('Escape')
  await expect(admin.getByRole('dialog')).toBeHidden()

  await admin.goto('/privacy')
  await expect(admin.getByRole('heading', { name: 'Informativa privacy' })).toBeVisible()
  await expectNoViolationsInBothSchemes(admin)

  const guest = await newContext()
  try {
    const guestPage = await guest.newPage()
    await guestPage.goto('/invitation/token-inesistente')
    await expect(guestPage.getByRole('heading', { name: 'Invito non valido' })).toBeVisible()
    await expectNoViolationsInBothSchemes(guestPage)
  } finally {
    await guest.close()
  }
})

test('employees do not see the management group and get the forbidden page on /users', async () => {
  await clearInbox()
  const context = await newContext()
  try {
    const page = await context.newPage()
    await signIn(page, EMPLOYEE, PASSWORD)
    const navigation = page.getByRole('navigation', { name: 'Navigazione principale' })
    await expect(navigation.getByRole('link', { name: 'Home' })).toBeVisible()
    await expect(navigation.getByText('Gestione')).toHaveCount(0)
    await expect(navigation.getByRole('link', { name: 'Utenti' })).toHaveCount(0)
    await expect(navigation.getByRole('link', { name: 'Amministratori' })).toHaveCount(0)

    await page.goto('/users')
    await expect(page.getByRole('heading', { name: 'Non hai i permessi per questa pagina' })).toBeVisible()
    await expectNoViolationsInBothSchemes(page)
  } finally {
    await context.close()
  }
})

test('managers see Users but not Administrators, without actions on admins', async () => {
  await clearInbox()
  const context = await newContext()
  try {
    const page = await context.newPage()
    await signIn(page, MANAGER, PASSWORD)
    const navigation = page.getByRole('navigation', { name: 'Navigazione principale' })
    await expect(navigation.getByText('Gestione')).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Amministratori' })).toHaveCount(0)
    await navigation.getByRole('link', { name: 'Utenti' }).click()

    await expect(page).toHaveURL(/\/users$/)
    await expect(page.getByRole('heading', { name: 'Utenti', level: 1 })).toBeVisible()
    await expect(navigation.getByRole('link', { name: 'Utenti' })).toHaveAttribute('aria-current', 'page')
    const table = page.getByRole('table')
    // Il responsabile vede anche gli admin, ma senza azioni su di loro né su sé stesso
    await expect(table.getByRole('row').filter({ hasText: 'admin@holidays.test' })).toBeVisible()
    await expect(table.getByRole('button', { name: 'Azioni per Giulia Rossi' })).toHaveCount(0)
    await expect(table.getByRole('button', { name: 'Azioni per Marco Bianchi' })).toHaveCount(0)
    await expect(table.getByRole('button', { name: 'Azioni per Sara Colombo' })).toBeVisible()

    await page.goto('/admin/administrators')
    await expect(page.getByRole('heading', { name: 'Non hai i permessi per questa pagina' })).toBeVisible()
  } finally {
    await context.close()
  }
})

test('an admin invites a new administrator, who shows up as invited, then cancels the invitation', async () => {
  await admin.goto('/admin/administrators')
  await admin.getByRole('button', { name: 'Aggiungi admin' }).click()
  const dialog = admin.getByRole('dialog', { name: 'Aggiungi un amministratore' })
  await dialog.getByRole('radio', { name: 'Nuova persona' }).check()
  await dialog.getByLabel('Nome e cognome').fill(NEW_ADMIN_NAME)
  await dialog.getByLabel('Email aziendale').fill(NEW_ADMIN)
  await dialog.getByLabel('La tua password').fill(PASSWORD)
  await dialog.getByRole('button', { name: 'Invita amministratore' }).click()
  await expect(admin.getByText(`Invito da amministratore inviato a ${NEW_ADMIN}.`)).toBeVisible()
  await waitForInvitationLink(NEW_ADMIN)

  const row = admin.getByRole('listitem').filter({ hasText: NEW_ADMIN })
  await expect(row.getByText('Invitato')).toBeVisible()
  await expect(row.getByText(/Invito scade il/)).toBeVisible()
  await expect(row.getByRole('button', { name: `Revoca ${NEW_ADMIN_NAME}` })).toHaveCount(0)

  // Pulizia: l'invito annullato elimina l'account non attivato
  await row.getByRole('button', { name: `Annulla invito di ${NEW_ADMIN_NAME}` }).click()
  await admin.getByRole('alertdialog').getByRole('button', { name: `Annulla invito di ${NEW_ADMIN_NAME}` }).click()
  await expect(admin.getByText('Invito annullato.')).toBeVisible()
  await expect(admin.getByRole('listitem').filter({ hasText: NEW_ADMIN })).toHaveCount(0)
})

test('the users table filters by name and role and sorts by email', async () => {
  await admin.setViewportSize({ width: 1280, height: 800 })
  await admin.goto('/users')
  const table = admin.getByRole('table')
  await expect(table.getByRole('row').nth(1)).toBeVisible()

  // Nome: debounce e URL aggiornato
  await admin.getByRole('searchbox', { name: 'Nome' }).fill('Marco')
  await expect(admin).toHaveURL(/[?&]name=Marco/)
  await expect(table.getByRole('row').filter({ hasText: 'manager@holidays.test' })).toBeVisible()
  await expect(table.getByRole('row').filter({ hasText: 'employee@holidays.test' })).toHaveCount(0)

  // Ruolo: con "Responsabile" restano solo i responsabili
  await admin.getByRole('button', { name: 'Azzera filtri' }).click()
  await expect(admin).toHaveURL(/\/users$/)
  await admin.getByRole('combobox', { name: 'Ruolo' }).click()
  await admin.getByRole('option', { name: 'Responsabile' }).click()
  await expect(admin).toHaveURL(/[?&]role=manager/)
  await expect(table.getByRole('row').filter({ hasText: 'manager@holidays.test' })).toBeVisible()
  await expect(table.getByRole('row').filter({ hasText: 'employee@holidays.test' })).toHaveCount(0)
  await expect(table.getByRole('row').filter({ hasText: 'admin@holidays.test' })).toHaveCount(0)

  // Ordinamento per email: prima crescente, poi decrescente, con aria-sort sull'intestazione
  await admin.getByRole('button', { name: 'Azzera filtri' }).click()
  const emailHeader = table.getByRole('columnheader').filter({ hasText: 'Email' })
  const firstEmail = async (): Promise<string> => (await table.getByRole('row').nth(1).getByRole('cell').nth(1).innerText()).trim()
  /** Clic sull'intestazione e attesa della risposta con quell'ordinamento: senza, si leggerebbero i dati precedenti */
  const sortBy = async (sort: string): Promise<void> => {
    await Promise.all([
      admin.waitForResponse((response) => response.url().includes('/api/users') && new URL(response.url()).searchParams.get('sort') === sort),
      emailHeader.getByRole('button', { name: 'Email' }).click(),
    ])
    // I dati precedenti restano visibili con aria-busy finché arriva la vista nuova
    await expect(admin.locator('[aria-busy="true"]')).toHaveCount(0)
  }

  await sortBy('email')
  await expect(admin).toHaveURL(/[?&]sort=email/)
  await expect(emailHeader).toHaveAttribute('aria-sort', 'ascending')
  const ascending = await firstEmail()

  await sortBy('-email')
  await expect(admin).toHaveURL(/[?&]sort=-email/)
  await expect(emailHeader).toHaveAttribute('aria-sort', 'descending')
  const descending = await firstEmail()
  // La prima email in ordine crescente viene prima della prima in ordine decrescente
  expect(ascending.localeCompare(descending)).toBeLessThan(0)

  // Indietro riporta all'ordinamento crescente
  await admin.goBack()
  await expect(emailHeader).toHaveAttribute('aria-sort', 'ascending')
})

test('admin pages fit a phone screen and work with the keyboard', async () => {
  await admin.emulateMedia({ colorScheme: 'light' })
  await admin.setViewportSize({ width: 360, height: 740 })
  // Filtro per nome: ogni esecuzione aggiunge un "E2E Invitato" che in ordine alfabetico viene prima di Marco Bianchi
  for (const { path, name } of [
    { path: '/users?name=marco', name: 'Marco Bianchi' },
    { path: '/admin/administrators', name: 'Giulia Rossi' },
  ]) {
    await admin.goto(path)
    await expect(admin.locator('#page-title')).toBeVisible()
    // Su telefono la lista ha una versione a schede e una a tabella: conta quella visibile
    await expect(admin.getByText(name).locator('visible=true').first()).toBeVisible()
    expect(await horizontalOverflow(admin), path).toBeLessThanOrEqual(0)
  }

  await admin.setViewportSize({ width: 1280, height: 800 })
  await admin.goto('/users?name=marco')
  const triggerLabel = 'Azioni per Marco Bianchi'
  const trigger = admin.getByRole('button', { name: triggerLabel })
  await expect(trigger).toBeVisible()
  // Tab fino al pulsante: tetto di tentativi per non girare all'infinito se il focus non ci arriva mai
  for (let step = 0; step < 40 && (await focusedLabel(admin)) !== triggerLabel; step += 1) {
    await admin.keyboard.press('Tab')
  }
  await expect(trigger).toBeFocused()
  await admin.keyboard.press('Enter')
  const items = admin.getByRole('menuitem')
  await expect(items.first()).toBeVisible()
  await admin.keyboard.press('ArrowDown')
  await expect(items.nth(1)).toBeFocused()
  await admin.keyboard.press('ArrowUp')
  await expect(items.first()).toBeFocused()
  await admin.keyboard.press('Escape')
  await expect(items.first()).toBeHidden()
  await expect(trigger).toBeFocused()
})
