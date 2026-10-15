import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type APIResponse, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { z } from 'zod'
import { signIn } from './auth.ts'
import { clearInbox } from './mailpit.ts'

const ADMIN = 'admin@holidays.test'
const MANAGER = 'manager@holidays.test'
const MANAGER_NAME = 'Marco Bianchi'
const EMPLOYEE = 'employee@holidays.test'
const EMPLOYEE_NAME = 'Sara Colombo'
// Dipendente semplice spostato di sede che resta Utente (spec §6.3); non entra mai, la sua password non cambia
const PLAIN_EMPLOYEE = 'reset@holidays.test'
const PLAIN_EMPLOYEE_NAME = 'Paolo Greco'
// Resta nella sede principale: per il responsabile spostato è "una persona di un'altra sede"
const OTHER = 'profile@holidays.test'
const PASSWORD = 'holidays-dev-password'
const LOCATION_NAME = `E2E ${Date.now()}`
const MOVED_PEOPLE: Array<[email: string, name: string]> = [
  [EMPLOYEE, EMPLOYEE_NAME],
  [MANAGER, MANAGER_NAME],
  [PLAIN_EMPLOYEE, PLAIN_EMPLOYEE_NAME],
]
// Richieste API dell'admin in questo file (caricamenti delle pagine e chiamate dirette), contro un limite di 60 al minuto
const ADMIN_API_BUDGET = 50
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const COLOR_SCHEMES: Array<'light' | 'dark'> = ['light', 'dark']

test.describe.configure({ mode: 'serial' })

/** Controllo axe in chiaro e in scuro senza ricaricare la pagina (lo stato resta). */
const expectNoViolationsInBothSchemes = async (page: Page): Promise<void> => {
  for (const colorScheme of COLOR_SCHEMES) {
    await page.emulateMedia({ colorScheme })
    const html = page.locator('html')
    if (colorScheme === 'dark') await expect(html).toHaveClass(/\bdark\b/)
    else await expect(html).not.toHaveClass(/\bdark\b/)
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
  }
}

const horizontalOverflow = async (page: Page): Promise<number> =>
  // Espressione come stringa: le spec girano con il tsconfig di Node, senza i tipi del DOM
  z.number().parse(await page.evaluate('document.documentElement.scrollWidth - window.innerWidth'))

/** Lunedì dell'Angelo: Pasqua gregoriana (algoritmo anonimo, Meeus/Jones/Butcher) più un giorno, come nel backend. */
const easterMonday = (year: number): Date => {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day + 1))
}

const dayLabel = (date: Date): string => new Intl.DateTimeFormat('it', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let browserRef: Browser
let baseURL: string
let adminContext: BrowserContext | null = null
let admin: Page
const extraContexts: BrowserContext[] = []
let locationId: number | null = null
// Vero quando l'ultimo test ha già rimesso tutto com'era: la pulizia finale non rifà le chiamate
let restored = false

const newContext = async (): Promise<BrowserContext> => {
  const context = await browserRef.newContext({ baseURL, locale: 'it-IT' })
  extraContexts.push(context)
  return context
}

/**
 * Chiamata all'API con la sessione della pagina (cookie, token CSRF e origine della SPA, come fa src/lib/api.ts).
 * Sul 429 del limite di 60 richieste al minuto per utente aspetta i secondi di Retry-After e riprova una volta, così
 * la pulizia riesce anche dopo un'esecuzione interrotta a metà.
 */
const api = async (page: Page, method: 'GET' | 'POST' | 'PATCH', path: string, data?: unknown): Promise<APIResponse> => {
  const send = async (): Promise<APIResponse> => {
    const cookies = await page.context().cookies()
    const xsrf = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? ''
    return page.request.fetch(path, {
      method,
      data,
      headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': decodeURIComponent(xsrf), Origin: baseURL, Referer: `${baseURL}/` },
    })
  }
  const response = await send()
  if (response.status() !== 429) return response
  const seconds = Number(response.headers()['retry-after'] ?? '60') || 60
  await new Promise((resolve) => setTimeout(resolve, (seconds + 1) * 1000))
  return send()
}

const personSchema = z.object({ data: z.array(z.object({ id: z.number(), email: z.string(), first_name: z.string(), last_name: z.string(), role: z.string() })) })

const findPerson = async (page: Page, email: string) => {
  // Il filtro email è "contiene": si prende la persona con l'indirizzo esatto
  const response = await api(page, 'GET', `/api/users?filter[email]=${encodeURIComponent(email)}`)
  const person = personSchema.parse(await response.json()).data.find((item) => item.email === email)
  if (!person) throw new Error(`${email} non trovato`)
  return person
}

const primaryLocationId = async (page: Page): Promise<number> => {
  const options = z.object({ data: z.array(z.object({ id: z.number(), is_primary: z.boolean() })) }).parse(await (await api(page, 'GET', '/api/locations/options')).json())
  const primary = options.data.find((option) => option.is_primary)
  if (!primary) throw new Error('Sede principale mancante')
  return primary.id
}

/** Riporta le persone spostate nella principale e Sara al ruolo Utente; restituisce gli stati HTTP delle chiamate. */
const putPeopleBack = async (): Promise<number[]> => {
  const primaryId = await primaryLocationId(admin)
  const statuses: number[] = []
  for (const [email] of MOVED_PEOPLE) {
    const person = await findPerson(admin, email)
    statuses.push((await api(admin, 'PATCH', `/api/users/${person.id}`, { first_name: person.first_name, last_name: person.last_name, location_id: primaryId })).status())
    if (email === EMPLOYEE && person.role === 'manager') statuses.push((await api(admin, 'PATCH', `/api/users/${person.id}/role`, { role: 'employee' })).status())
  }
  return statuses
}

/**
 * Il limite di 60 richieste API al minuto è per utente, quindi condiviso con il file che ha appena lavorato come admin
 * (admin-users.spec.ts): se nella finestra corrente ne restano meno di quelle che servono, si aspetta che si chiuda.
 */
const waitForAdminApiBudget = async (): Promise<void> => {
  const response = await api(admin, 'GET', '/api/auth/user')
  const remaining = Number(response.headers()['x-ratelimit-remaining'] ?? '0')
  if (remaining < ADMIN_API_BUDGET) await new Promise((resolve) => setTimeout(resolve, 61_000))
}

test.beforeAll(async ({ browser }) => {
  // Margine per l'eventuale attesa del limite delle API
  test.setTimeout(120_000)
  browserRef = browser
  const configured = test.info().project.use.baseURL
  if (!configured) throw new Error('baseURL non configurato')
  baseURL = configured
  await clearInbox()
  // Un solo login admin per file: il limite è di 5 al minuto per email e IP
  adminContext = await browserRef.newContext({ baseURL, locale: 'it-IT' })
  admin = await adminContext.newPage()
  await signIn(admin, ADMIN, PASSWORD)
  await waitForAdminApiBudget()
})

test.afterAll(async () => {
  try {
    // Pulizia anche dopo un errore a metà: persone nella principale, ruolo di Sara, sede archiviata
    if (adminContext && !restored) {
      await putPeopleBack()
      // Già archiviata dall'ultimo test: il 409 si ignora
      if (locationId !== null) await api(admin, 'POST', `/api/locations/${locationId}/archive`)
    }
  } finally {
    for (const context of extraContexts) await context.close()
    await adminContext?.close()
  }
})

test('with a single active location there is no trace of the location column', async () => {
  await admin.goto('/admin/locations')
  const activeTab = admin.getByRole('tab', { name: /Attive/ })
  await expect(activeTab).toContainText(/\d/)
  const active = Number((await activeTab.textContent())?.replace(/\D/g, '') ?? '0')
  test.skip(active > 1, `Nel database di sviluppo ci sono già ${active} sedi attive`)

  // Navigazione interna: ogni caricamento completo della SPA conta nel limite di 60 richieste API al minuto
  await admin.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Utenti' }).click()
  await expect(admin.getByRole('columnheader', { name: 'Tipo' })).toBeVisible()
  await expect(admin.getByRole('columnheader', { name: 'Sede' })).toHaveCount(0)
})

const openLocationsFromMenu = async (): Promise<void> => {
  await admin.getByRole('navigation', { name: 'Navigazione principale' }).getByRole('link', { name: 'Sedi' }).click()
  await expect(admin.getByRole('heading', { level: 1, name: 'Sedi' })).toBeVisible()
}

test('an admin creates a location with its patron and checks the calendar of the year', async () => {
  await openLocationsFromMenu()
  await admin.getByRole('button', { name: 'Nuova sede' }).click()
  const dialog = admin.getByRole('dialog', { name: 'Nuova sede' })
  await dialog.getByLabel('Nome').fill(LOCATION_NAME)
  await dialog.getByLabel('Città').fill('Milano')
  await dialog.getByLabel('Patrono (giorno/mese)').fill('07/12')
  await dialog.getByRole('button', { name: 'Crea sede' }).click()

  await expect(admin.getByText(`Sede ${LOCATION_NAME} creata.`)).toBeVisible()
  await expect(admin).toHaveURL(/\/admin\/locations\/\d+$/)
  locationId = Number(new URL(admin.url()).pathname.split('/').pop())
  await expect(admin.getByRole('heading', { level: 1, name: LOCATION_NAME })).toBeVisible()

  // L'anno prossimo: Pasquetta e patrono nel giorno giusto
  const year = new Date().getFullYear() + 1
  const calendar = admin.getByRole('region', { name: 'Calendario dell’anno' })
  await calendar.getByRole('combobox', { name: 'Anno' }).click()
  await admin.getByRole('option', { name: String(year) }).click()
  await expect(calendar.getByRole('listitem').filter({ hasText: dayLabel(easterMonday(year)) })).toContainText(/Angelo/)
  await expect(calendar.getByRole('listitem').filter({ hasText: dayLabel(new Date(Date.UTC(year, 11, 7))) })).toContainText(/patrono|E2E/i)

  await expectNoViolationsInBothSchemes(admin)
  await admin.setViewportSize({ width: 360, height: 800 })
  expect(await horizontalOverflow(admin)).toBeLessThanOrEqual(0)
  await admin.setViewportSize({ width: 1280, height: 800 })
})

test('the admin promotes an employee to manager and moves her, a manager and an employee to the new location', async () => {
  // Una sola pagina per tutte le modifiche (limite di 60 richieste API al minuto): le tre persone sono tra le prime per
  // cognome (Bianchi, Colombo, Greco), quindi nella prima pagina della lista
  await admin.goto('/users')
  const rowOf = (email: string) => admin.getByRole('table').getByRole('row').filter({ hasText: email })

  // Cambio di ruolo: Sara diventa responsabile
  const saraRow = rowOf(EMPLOYEE)
  await saraRow.getByRole('button', { name: `Azioni per ${EMPLOYEE_NAME}` }).click()
  await admin.getByRole('menuitem', { name: 'Cambia ruolo' }).click()
  const roleDialog = admin.getByRole('dialog', { name: `Cambia ruolo di ${EMPLOYEE_NAME}` })
  await roleDialog.getByRole('radio', { name: 'Responsabile' }).check()
  await roleDialog.getByRole('button', { name: 'Salva ruolo' }).click()
  await expect(admin.getByText(`Ruolo di ${EMPLOYEE_NAME} aggiornato.`)).toBeVisible()

  // Cambio di sede di Sara, di Marco e di Paolo dalla Modifica, con la nota sul nuovo responsabile
  for (const [email, name] of MOVED_PEOPLE) {
    const row = rowOf(email)
    await row.getByRole('button', { name: `Azioni per ${name}` }).click()
    await admin.getByRole('menuitem', { name: 'Modifica' }).click()
    const dialog = admin.getByRole('dialog', { name: `Modifica ${name}` })
    await expect(dialog.getByText('La persona passa al responsabile della nuova sede.')).toBeVisible()
    await dialog.getByRole('combobox', { name: 'Sede' }).click()
    await admin.getByRole('option', { name: LOCATION_NAME }).click()
    await dialog.getByRole('button', { name: 'Salva' }).click()
    await expect(admin.getByText(`Dati di ${name} aggiornati.`)).toBeVisible()
    await expect(row.getByRole('cell', { name: LOCATION_NAME })).toBeVisible()
  }

  // Con due sedi l'admin vede colonna e filtro Sede: nella nuova le tre persone spostate (più l'intestazione)
  await admin.goto(`/users?location=${locationId}`)
  await expect(admin.getByRole('columnheader', { name: 'Sede' })).toBeVisible()
  await expect(admin.getByRole('table').getByRole('row')).toHaveCount(MOVED_PEOPLE.length + 1)
  // Paolo è stato solo spostato: resta Utente
  await expect(admin.getByRole('table').getByRole('row').filter({ hasText: PLAIN_EMPLOYEE })).toContainText('Utente')
  await expectNoViolationsInBothSchemes(admin)
})

test('the manager sees only the people of his location and gets 404 for the others', async () => {
  await clearInbox()
  const context = await newContext()
  const manager = await context.newPage()
  await signIn(manager, MANAGER, PASSWORD)

  await manager.goto('/users')
  await expect(manager.getByRole('heading', { level: 1, name: `Utenti · ${LOCATION_NAME}` })).toBeVisible()
  const table = manager.getByRole('table')
  await expect(table.getByRole('row').filter({ hasText: EMPLOYEE })).toBeVisible()
  await expect(table.getByRole('row').filter({ hasText: PLAIN_EMPLOYEE })).toContainText('Utente')
  await expect(table.getByRole('row').filter({ hasText: OTHER })).toHaveCount(0)
  // Nessuna colonna, filtro o campo Sede per il responsabile
  await expect(manager.getByRole('columnheader', { name: 'Sede' })).toHaveCount(0)

  // Indirizzo di una persona di un'altra sede: per lui non esiste
  const other = await findPerson(admin, OTHER)
  expect((await api(manager, 'GET', `/api/users/${other.id}/history`)).status()).toBe(404)
  expect((await api(manager, 'POST', `/api/users/${other.id}/disable`)).status()).toBe(404)
})

test('the history shows the promotion and the move, in the profile and in the users table', async () => {
  await clearInbox()
  const context = await newContext()
  const sara = await context.newPage()
  await signIn(sara, EMPLOYEE, PASSWORD)

  await sara.goto('/profile')
  const history = sara.getByRole('region', { name: 'Storico' })
  await expect(history).toContainText('Ruolo: Utente → Responsabile')
  await expect(history).toContainText(new RegExp(`Sede: .+ → ${escapeRegExp(LOCATION_NAME)}`))
  await expect(sara.getByRole('region', { name: 'Dati personali' }).getByLabel('Sede')).toHaveValue(LOCATION_NAME)
  await expectNoViolationsInBothSchemes(sara)

  // Dal menu di riga l'admin vede le stesse tappe con chi le ha fatte (la sua pagina è ancora sulla lista della nuova sede)
  await admin.getByRole('table').getByRole('row').filter({ hasText: EMPLOYEE }).getByRole('button', { name: `Azioni per ${EMPLOYEE_NAME}` }).click()
  await admin.getByRole('menuitem', { name: 'Storico' }).click()
  const dialog = admin.getByRole('dialog', { name: `Storico di ${EMPLOYEE_NAME}` })
  await expect(dialog).toContainText('Ruolo: Utente → Responsabile')
  await expect(dialog.getByText('da Giulia Rossi').first()).toBeVisible()
  await admin.keyboard.press('Escape')
})

test('the admin puts everything back and archives the location', async () => {
  expect(await putPeopleBack()).toEqual([200, 200, 200, 200])

  await openLocationsFromMenu()
  await admin.getByRole('row').filter({ hasText: LOCATION_NAME }).getByRole('button', { name: `Azioni per ${LOCATION_NAME}` }).click()
  await admin.getByRole('menuitem', { name: 'Archivia' }).click()
  await admin.getByRole('alertdialog', { name: `Archiviare ${LOCATION_NAME}?` }).getByRole('button', { name: 'Archivia' }).click()
  await expect(admin.getByText(`${LOCATION_NAME} archiviata.`)).toBeVisible()
  await admin.getByRole('tab', { name: /Archiviate/ }).click()
  await expect(admin.getByRole('link', { name: LOCATION_NAME })).toBeVisible()
  restored = true
})
