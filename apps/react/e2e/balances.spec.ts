import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type APIResponse, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { z } from 'zod'
import { signIn } from './auth.ts'
import { clearInbox } from './mailpit.ts'

const ADMIN = 'admin@holidays.test'
const MANAGER = 'manager@holidays.test'
const MANAGER_NAME = 'Marco Bianchi'
const EMPLOYEE = 'employee@holidays.test'
const EMPLOYEE_NAME = 'Sara Colombo'
const PASSWORD = 'holidays-dev-password'
const LAW_104 = 'Legge 104'
// Valori della busta paga e annui usati dal test
const PAYSLIP_VACATION_HOURS = '80'
const ANNUAL_VACATION_HOURS = '160'
const ANNUAL_ROL_HOURS = '72'
const ANNUAL_ROL_MINUTES = 4320
const ANNUAL_VACATION_MINUTES = 9600
// Timeout di test e hook che chiamano l'API direttamente: `api()` può aspettare fino a ~61 s su un 429
const API_RETRY_TIMEOUT = 150_000
// Richieste API dell'admin in questo file, contro un limite di 60 al minuto per utente
const ADMIN_API_BUDGET = 40
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

let browserRef: Browser
let baseURL: string
let adminContext: BrowserContext | null = null
let admin: Page
const extraContexts: BrowserContext[] = []

/** Valori letti all'inizio, da rimettere alla fine (restano null finché non sono stati letti). */
interface AccrualMinutes {
  vacation_minutes: number
  rol_minutes: number
  ex_holidays_minutes: number
}
let originalAccrual: AccrualMinutes | null = null
let originalEnabledIds: number[] | null = null
let saraId: number | null = null
// Veri quando il test finale ha già rimesso tutto com'era: la pulizia di afterAll non rifà le chiamate
let accrualRestored = false
let enablementRestored = false
// Valore delle ferie di Sara visto dal responsabile (riquadro della scheda), che il dipendente deve ritrovare
let saraVacationText = ''

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
const api = async (page: Page, method: 'GET' | 'PATCH' | 'PUT', path: string, data?: unknown): Promise<APIResponse> => {
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

const expectStatus = (label: string, response: APIResponse, expected: number): void => {
  if (response.status() !== expected) throw new Error(`${label}: HTTP ${response.status()} invece di ${expected}`)
}

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Esegue un passo della pulizia senza fermare i successivi: l'eventuale errore finisce in `errors`. */
const attempt = async (errors: string[], label: string, step: () => Promise<void>): Promise<void> => {
  try {
    await step()
  } catch (error) {
    errors.push(`${label}: ${describeError(error)}`)
  }
}

const personSchema = z.object({ data: z.array(z.object({ id: z.number(), email: z.string() })) })

const findPersonId = async (email: string): Promise<number> => {
  // Il filtro email è "contiene": si prende la persona con l'indirizzo esatto
  const response = await api(admin, 'GET', `/api/users?filter[email]=${encodeURIComponent(email)}`)
  const person = personSchema.parse(await response.json()).data.find((item) => item.email === email)
  if (!person) throw new Error(`${email} non trovato`)
  return person.id
}

const accrualSchema = z.object({ data: z.object({ values: z.object({ vacation_minutes: z.number(), rol_minutes: z.number(), ex_holidays_minutes: z.number() }) }) })

const readAccrual = async (): Promise<AccrualMinutes> => {
  const response = await api(admin, 'GET', '/api/settings/accrual')
  expectStatus('GET accrual', response, 200)
  return accrualSchema.parse(await response.json()).data.values
}

const enablementsSchema = z.object({ data: z.array(z.object({ id: z.number(), name: z.string(), requires_enablement: z.boolean(), enabled: z.boolean() })) })

const readEnablements = async (userId: number) => {
  const response = await api(admin, 'GET', `/api/users/${userId}/absence-types`)
  expectStatus('GET absence-types', response, 200)
  return enablementsSchema.parse(await response.json()).data
}

/** Ore come le scrive l'interfaccia in italiano: virgola decimale, al massimo 2 cifre, niente zeri finali. */
const hoursText = (minutes: number): string => String(Number((minutes / 60).toFixed(2))).replace('.', ',')

/**
 * Il limite di 60 richieste API al minuto è per utente, quindi condiviso con il file che ha appena lavorato come admin:
 * se nella finestra corrente ne restano meno di quelle che servono, si aspetta che si chiuda.
 */
const waitForAdminApiBudget = async (): Promise<void> => {
  const response = await api(admin, 'GET', '/api/auth/user')
  const remaining = Number(response.headers()['x-ratelimit-remaining'] ?? '0')
  if (remaining < ADMIN_API_BUDGET) await new Promise((resolve) => setTimeout(resolve, 61_000))
}

/** Le esecuzioni di leave.spec.ts aggiungono movimenti di utilizzo: l'allineamento può non stare nella prima pagina dei movimenti, quindi si carica altro finché compare. */
const loadMovementsUntilVisible = async (scope: Locator | Page, movement: Locator): Promise<void> => {
  const more = scope.getByRole('button', { name: 'Carica altre' })
  const items = scope.getByRole('list', { name: 'Movimenti' }).getByRole('listitem')
  // Prima pagina arrivata
  await expect(items.first()).toBeVisible()
  for (let step = 0; step < 10 && (await movement.count()) === 0 && (await more.count()) > 0; step += 1) {
    const before = await items.count()
    await more.click()
    // La pagina nuova è arrivata quando le righe aumentano
    await expect.poll(() => items.count()).toBeGreaterThan(before)
  }
}

const mainNavigation = (page: Page): Locator => page.getByRole('navigation', { name: 'Navigazione principale' })

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000)
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
  // Prima di toccare qualcosa si leggono i valori da rimettere
  originalAccrual = await readAccrual()
  saraId = await findPersonId(EMPLOYEE)
  originalEnabledIds = (await readEnablements(saraId)).filter((option) => option.requires_enablement && option.enabled).map((option) => option.id)
})

test.afterAll(async () => {
  test.setTimeout(API_RETRY_TIMEOUT)
  try {
    // Pulizia anche dopo un errore a metà: valori annui e abilitazioni di Sara come all'inizio. Gli errori si sommano:
    // una pulizia incompleta fa fallire il file invece di passare inosservata
    if (adminContext) {
      const errors: string[] = []
      const accrual = originalAccrual
      if (accrual !== null && !accrualRestored) {
        await attempt(errors, 'valori annui', async () => expectStatus('PATCH accrual', await api(admin, 'PATCH', '/api/settings/accrual', accrual), 200))
      }
      const enabledIds = originalEnabledIds
      const userId = saraId
      if (enabledIds !== null && userId !== null && !enablementRestored) {
        await attempt(errors, `abilitazioni di ${EMPLOYEE}`, async () =>
          expectStatus('PUT abilitazioni', await api(admin, 'PUT', `/api/users/${userId}/absence-type-enablements`, { absence_type_ids: enabledIds }), 200),
        )
      }
      if (errors.length > 0) throw new Error(`Pulizia incompleta del database di sviluppo:\n${errors.join('\n')}`)
    }
  } finally {
    for (const context of extraContexts) await context.close()
    await adminContext?.close()
  }
})

test('the admin sets the annual values in Settings and sees them saved', async () => {
  await mainNavigation(admin).getByRole('link', { name: 'Impostazioni' }).click()
  await expect(admin.getByRole('heading', { level: 1, name: 'Impostazioni' })).toBeVisible()
  const vacation = admin.getByRole('textbox', { name: 'Ferie', exact: true })
  const rol = admin.getByRole('textbox', { name: 'ROL', exact: true })
  // Il form parte dai valori del server
  const original = originalAccrual
  if (original === null) throw new Error('valori annui iniziali non letti')
  await expect(vacation).toHaveValue(hoursText(original.vacation_minutes))

  await vacation.fill(ANNUAL_VACATION_HOURS)
  await rol.fill(ANNUAL_ROL_HOURS)
  await admin.getByRole('button', { name: 'Salva' }).click()
  await expect(admin.getByText('Valori salvati.')).toBeVisible()

  // Il form si rimonta con i dati salvati e il server ha gli stessi valori
  await expect(rol).toHaveValue(ANNUAL_ROL_HOURS)
  await expect(admin.getByText('6 h al mese')).toBeVisible()
  const saved = await readAccrual()
  expect(saved.vacation_minutes).toBe(ANNUAL_VACATION_MINUTES)
  expect(saved.rol_minutes).toBe(ANNUAL_ROL_MINUTES)
  expect(saved.ex_holidays_minutes).toBe(original.ex_holidays_minutes)
})

test('the admin enables Legge 104 for an employee from the Users table', async () => {
  await mainNavigation(admin).getByRole('link', { name: 'Utenti' }).click()
  await expect(admin.getByRole('columnheader', { name: 'Tipo' })).toBeVisible()
  const row = admin.getByRole('table').getByRole('row').filter({ hasText: EMPLOYEE })
  await row.getByRole('button', { name: `Azioni per ${EMPLOYEE_NAME}` }).click()
  await admin.getByRole('menuitem', { name: 'Tipi di assenza' }).click()

  const dialog = admin.getByRole('dialog', { name: `Tipi di assenza di ${EMPLOYEE_NAME}` })
  const law = dialog.getByRole('checkbox', { name: LAW_104 })
  await expect(law).toBeVisible()
  // Se era già abilitata (un'esecuzione interrotta) la si disabilita prima, così il test parte sempre da "no"
  if ((await law.getAttribute('aria-checked')) === 'true') {
    await law.click()
    await dialog.getByRole('button', { name: 'Salva' }).click()
    await expect(admin.getByText(`Abilitazioni di ${EMPLOYEE_NAME} salvate.`)).toBeVisible()
    await expect(dialog).toHaveCount(0)
    await row.getByRole('button', { name: `Azioni per ${EMPLOYEE_NAME}` }).click()
    await admin.getByRole('menuitem', { name: 'Tipi di assenza' }).click()
  }
  const reopened = admin.getByRole('dialog', { name: `Tipi di assenza di ${EMPLOYEE_NAME}` })
  await reopened.getByRole('checkbox', { name: LAW_104 }).check()
  await reopened.getByRole('button', { name: 'Salva' }).click()
  await expect(admin.getByText(`Abilitazioni di ${EMPLOYEE_NAME} salvate.`).first()).toBeVisible()
  await expect(reopened).toHaveCount(0)

  const userId = saraId
  if (userId === null) throw new Error('id di Sara non letto')
  const law104 = (await readEnablements(userId)).find((option) => option.name === LAW_104)
  expect(law104?.enabled).toBe(true)
})

test('the manager aligns Sara to the payslip and sees the movement with his name', async () => {
  test.setTimeout(API_RETRY_TIMEOUT)
  await clearInbox()
  const context = await newContext()
  const manager = await context.newPage()
  await signIn(manager, MANAGER, PASSWORD)

  await mainNavigation(manager).getByRole('link', { name: 'Saldi' }).click()
  await expect(manager.getByRole('heading', { level: 1, name: /^Saldi/ })).toBeVisible()
  await manager.getByLabel('Cerca per nome o email').fill('Colombo')
  const row = manager.getByRole('table').getByRole('row').filter({ hasText: EMPLOYEE_NAME })
  await expect(row).toBeVisible()
  await expectNoViolationsInBothSchemes(manager)

  await row.getByRole('button', { name: `Azioni per ${EMPLOYEE_NAME}` }).click()
  await manager.getByRole('menuitem', { name: 'Allinea alla busta paga' }).click()
  const align = manager.getByRole('dialog', { name: `Allinea alla busta paga di ${EMPLOYEE_NAME}` })
  // La data proposta è l'ultimo giorno del mese scorso: si lascia così
  await align.getByLabel('Ferie, in busta paga').fill(PAYSLIP_VACATION_HOURS)
  await expect(align.getByText(/Nell’app al \d{2}\/\d{2}\/\d{4}/).first()).toBeVisible()
  await align.getByRole('button', { name: 'Allinea' }).click()
  await expect(manager.getByText(/Saldo allineato al \d{2}\/\d{2}\/\d{4}/)).toBeVisible()
  await expect(align).toHaveCount(0)

  // La scheda di Sara: movimento con il nome di chi ha allineato e saldo ferie del riquadro
  await manager.getByRole('table').getByRole('button', { name: EMPLOYEE_NAME, exact: true }).click()
  const card = manager.getByRole('dialog', { name: `Saldi di ${EMPLOYEE_NAME}` })
  const movement = card.getByRole('list', { name: 'Movimenti' }).getByRole('listitem').filter({ hasText: new RegExp(`Allineata alla busta paga del \\d{2}/\\d{2}/\\d{4}: da .+ a ${PAYSLIP_VACATION_HOURS} h`) })
  await loadMovementsUntilVisible(card, movement)
  await expect(movement.first()).toContainText(`da ${MANAGER_NAME}`)
  const big = card.getByRole('region', { name: 'Ferie', exact: true }).getByText(/^[−-]?[\d.,]+ h$/).first()
  await expect(big).toBeVisible()
  saraVacationText = (await big.textContent()) ?? ''
  expect(saraVacationText).not.toBe('')
  await manager.keyboard.press('Escape')
  await expect(card).toHaveCount(0)

  // Lo stesso saldo ferie nella riga della pagina Saldi
  await expect(row).toContainText(saraVacationText)
})

test('the manager has no Adjust on his own row and no Absence types page', async () => {
  const manager = extraContexts[0]?.pages()[0]
  if (!manager) throw new Error('pagina del responsabile non disponibile')
  await manager.getByLabel('Cerca per nome o email').fill('Bianchi')
  const row = manager.getByRole('table').getByRole('row').filter({ hasText: MANAGER_NAME })
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: `Azioni per ${MANAGER_NAME}` }).click()
  await expect(manager.getByRole('menuitem', { name: 'Apri saldi' })).toBeVisible()
  await expect(manager.getByRole('menuitem', { name: 'Rettifica' })).toHaveCount(0)
  await expect(manager.getByRole('menuitem', { name: 'Allinea alla busta paga' })).toHaveCount(0)
  await manager.keyboard.press('Escape')

  await expect(mainNavigation(manager).getByRole('link', { name: 'Tipi di assenza' })).toHaveCount(0)
  await manager.goto('/admin/absence-types')
  await expect(manager.getByRole('heading', { name: 'Non hai i permessi per questa pagina' })).toBeVisible()
})

test('the employee sees the same vacation balance and the alignment without an author', async () => {
  test.setTimeout(API_RETRY_TIMEOUT)
  await clearInbox()
  const context = await newContext()
  const sara = await context.newPage()
  await signIn(sara, EMPLOYEE, PASSWORD)

  // Dalla fase 3 i saldi sono nella Home (dove atterra dopo l'accesso), non più in Ferie e permessi
  await expect(sara.getByRole('heading', { name: /^Ciao, / })).toBeVisible()
  const vacation = sara.getByRole('region', { name: 'Ferie', exact: true })
  await expect(vacation.getByText(/^[−-]?[\d.,]+ h$/).first()).toHaveText(saraVacationText)

  const movement = sara.getByRole('list', { name: 'Movimenti' }).getByRole('listitem').filter({ hasText: new RegExp(`Allineata alla busta paga del \\d{2}/\\d{2}/\\d{4}: da .+ a ${PAYSLIP_VACATION_HOURS} h`) })
  await loadMovementsUntilVisible(sara, movement)
  await expect(movement.first()).toBeVisible()
  // L'autore non si vede nella vista del dipendente
  await expect(movement.first()).not.toContainText(MANAGER_NAME)
  await expect(sara.getByText(`da ${MANAGER_NAME}`)).toHaveCount(0)

  // L'abilitazione data dall'admin: Legge 104 tra i tipi che può usare
  await expect(sara.getByRole('list', { name: 'Tipi di assenza che puoi usare' })).toContainText(LAW_104)
  await expectNoViolationsInBothSchemes(sara)
})

test('the admin pages Balances, Absence types and Settings have no accessibility violations', async () => {
  await mainNavigation(admin).getByRole('link', { name: 'Saldi' }).click()
  await expect(admin.getByRole('heading', { level: 1, name: /^Saldi/ })).toBeVisible()
  await expect(admin.getByRole('table').getByRole('row').filter({ hasText: EMPLOYEE_NAME })).toBeVisible()
  await expectNoViolationsInBothSchemes(admin)

  await mainNavigation(admin).getByRole('link', { name: 'Tipi di assenza' }).click()
  await expect(admin.getByRole('heading', { level: 1, name: 'Tipi di assenza' })).toBeVisible()
  await expect(admin.getByRole('table').getByText(LAW_104).first()).toBeVisible()
  await expectNoViolationsInBothSchemes(admin)

  await mainNavigation(admin).getByRole('link', { name: 'Impostazioni' }).click()
  await expect(admin.getByRole('heading', { level: 1, name: 'Impostazioni' })).toBeVisible()
  await expect(admin.getByRole('textbox', { name: 'Ferie', exact: true })).toBeVisible()
  await expectNoViolationsInBothSchemes(admin)
})

test('the admin puts the annual values and the enablement back', async () => {
  test.setTimeout(API_RETRY_TIMEOUT)
  const original = originalAccrual
  const enabledIds = originalEnabledIds
  const userId = saraId
  if (original === null || enabledIds === null || userId === null) throw new Error('valori iniziali non letti')

  // Valori annui dalla pagina Impostazioni (dove si trova l'admin)
  await admin.getByRole('textbox', { name: 'Ferie', exact: true }).fill(hoursText(original.vacation_minutes))
  await admin.getByRole('textbox', { name: 'ROL', exact: true }).fill(hoursText(original.rol_minutes))
  await admin.getByRole('textbox', { name: 'Ex festività', exact: true }).fill(hoursText(original.ex_holidays_minutes))
  await admin.getByRole('button', { name: 'Salva' }).click()
  await expect(admin.getByText('Valori salvati.')).toBeVisible()
  expect(await readAccrual()).toEqual(original)
  accrualRestored = true

  // Abilitazione: la casella torna com'era all'inizio
  await mainNavigation(admin).getByRole('link', { name: 'Utenti' }).click()
  const row = admin.getByRole('table').getByRole('row').filter({ hasText: EMPLOYEE })
  await row.getByRole('button', { name: `Azioni per ${EMPLOYEE_NAME}` }).click()
  await admin.getByRole('menuitem', { name: 'Tipi di assenza' }).click()
  const dialog = admin.getByRole('dialog', { name: `Tipi di assenza di ${EMPLOYEE_NAME}` })
  const law = dialog.getByRole('checkbox', { name: LAW_104 })
  const law104 = (await readEnablements(userId)).find((option) => option.name === LAW_104)
  const wasEnabled = law104 !== undefined && enabledIds.includes(law104.id)
  if (wasEnabled) await law.check()
  else await law.uncheck()
  await dialog.getByRole('button', { name: 'Salva' }).click()
  await expect(admin.getByText(`Abilitazioni di ${EMPLOYEE_NAME} salvate.`).first()).toBeVisible()
  const after = (await readEnablements(userId)).filter((option) => option.requires_enablement && option.enabled).map((option) => option.id)
  expect(after.sort()).toEqual([...enabledIds].sort())
  enablementRestored = true
})
