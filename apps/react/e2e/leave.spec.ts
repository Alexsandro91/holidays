import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type APIResponse, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { z } from 'zod'
import { signIn } from './auth.ts'
import { clearInbox, waitForText } from './mailpit.ts'
import { BUDGET_HEAVY, BUDGET_LIGHT, ensureBudget, trackRateLimit } from './rateLimit.ts'

const MANAGER = 'manager@holidays.test'
const MANAGER_NAME = 'Marco Bianchi'
const EMPLOYEE = 'employee@holidays.test'
const EMPLOYEE_NAME = 'Sara Colombo'
const PASSWORD = 'holidays-dev-password'
const VACATION = 'Ferie'
const ROL = 'ROL'
// Giorni di ferie chiesti da Sara (lunedì e martedì: 2 giorni da 8 h) e ore del ROL del responsabile
const VACATION_DAYS = 2
const VACATION_HOURS = 16
const ROL_HOURS = 2
// Timeout dei test che chiamano l'API direttamente: `api()` può aspettare fino a ~61 s su un 429
const API_RETRY_TIMEOUT = 150_000
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']
const COLOR_SCHEMES: Array<'light' | 'dark'> = ['light', 'dark']
// Mesi senza festività nazionali: luglio, settembre, ottobre e novembre (i giorni scelti vanno dal 9 al 19).
// Si escludono solo i festivi nazionali: patrono e chiusure della sede di prova si assumono assenti (l'anteprima a 16 h lo verifica)
const QUIET_MONTHS = [7, 9, 10, 11]

test.describe.configure({ mode: 'serial', timeout: API_RETRY_TIMEOUT })

/** Date di prova, calcolate a ogni esecuzione in un mese futuro senza festivi. */
interface TestDates {
  year: number
  /** Mese 1-12 */
  month: number
  /** Lunedì e martedì della richiesta di ferie di Sara */
  mondayStart: string
  mondayEnd: string
  /** Mercoledì e giovedì della richiesta rifiutata */
  rejectedStart: string
  rejectedEnd: string
  /** Venerdì del ROL del responsabile */
  friday: string
}

const pad = (value: number): string => String(value).padStart(2, '0')
const dateText = (year: number, month: number, day: number): string => `${year}-${pad(month)}-${pad(day)}`

const computeDates = (now: Date): TestDates => {
  let year = now.getFullYear()
  let month = now.getMonth() + 2
  if (month > 12) {
    month = 1
    year += 1
  }
  while (!QUIET_MONTHS.includes(month)) {
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  // Primo lunedì dal 9 in poi: lunedì e martedì, mercoledì e giovedì, venerdì cadono entro il 19
  let monday = 9
  while (new Date(Date.UTC(year, month - 1, monday)).getUTCDay() !== 1) monday += 1
  return {
    year,
    month,
    mondayStart: dateText(year, month, monday),
    mondayEnd: dateText(year, month, monday + 1),
    rejectedStart: dateText(year, month, monday + 2),
    rejectedEnd: dateText(year, month, monday + 3),
    friday: dateText(year, month, monday + 4),
  }
}

/** Periodo come lo scrive l'app ("12–13 luglio 2027"): stesso formatter di `formatDayRange`. */
const periodText = (from: string, to: string): string => {
  const utc = (date: string): Date => new Date(`${date}T00:00:00Z`)
  if (from === to) return new Intl.DateTimeFormat('it-IT', { dateStyle: 'long', timeZone: 'UTC' }).format(utc(from))
  return new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatRange(utc(from), utc(to))
}

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

const mainNavigation = (page: Page): Locator => page.getByRole('navigation', { name: 'Navigazione principale' })

let browserRef: Browser
let baseURL: string
let dates: TestDates
let sara: Page
let manager: Page
const contexts: BrowserContext[] = []
// Richieste create dal test (id), da portare in uno stato finale anche dopo un errore
const created: Array<{ id: number; byManager: boolean }> = []
// Pianificate delle ferie di Sara prima di chiedere (in ore)
let plannedBefore = 0

const idSchema = z.object({ data: z.object({ id: z.number(), status: z.string() }) })

/**
 * Chiamata all'API con la sessione della pagina (cookie, token CSRF e origine della SPA, come fa src/lib/api.ts).
 * Sul 429 del limite di 60 richieste al minuto per utente aspetta i secondi di Retry-After e riprova una volta.
 */
const api = async (page: Page, method: 'GET' | 'POST', path: string, data?: unknown): Promise<APIResponse> => {
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

/** Ore da un testo come "16 h", "1.234,5 h" o "−8 h". */
const parseHours = (text: string): number => Number(text.replace('−', '-').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))

/** Ore "Pianificate" del riquadro Ferie nella Home. */
const plannedHours = async (page: Page): Promise<number> => {
  const dd = page.getByRole('region', { name: VACATION, exact: true }).getByText('Pianificate', { exact: true }).locator('xpath=following-sibling::dd')
  await expect(dd).toBeVisible()
  return parseHours((await dd.textContent()) ?? '')
}

/** Le decisioni di un'altra persona arrivano al suo browser solo con una nuova lettura: `fresh` ricarica la pagina (la sessione resta). */
const goHome = async (page: Page, fresh = false): Promise<void> => {
  await mainNavigation(page).getByRole('link', { name: 'Home' }).click()
  if (fresh) await page.reload()
  await expect(page.getByRole('heading', { name: /^Ciao, / })).toBeVisible()
}

const goLeave = async (page: Page, fresh = false): Promise<void> => {
  await mainNavigation(page).getByRole('link', { name: /^Ferie e permessi/ }).click()
  if (fresh) await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Ferie e permessi' })).toBeVisible()
}

const goApprovals = async (page: Page, fresh = false): Promise<Locator> => {
  await goLeave(page, fresh)
  await page.getByRole('tab', { name: /^Da approvare/ }).click()
  const heading = page.getByRole('heading', { level: 2, name: 'Da approvare' })
  await expect(heading).toBeVisible()
  return page.getByRole('tabpanel')
}

/** Porta il calendario nel mese di prova: la pagina può essere già su un altro mese, quindi si avanza finché il titolo coincide. */
const showTestMonth = async (page: Page): Promise<void> => {
  const monthName = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(dates.year, dates.month - 1, 1)))
  const grid = page.getByRole('grid', { name: monthName })
  for (let step = 0; step < 24 && (await grid.count()) === 0; step += 1) {
    await page.getByRole('button', { name: 'Mese successivo' }).click()
    await expect(page.getByRole('grid')).toBeVisible()
  }
  await expect(grid).toBeVisible()
}

/** Compila e invia la richiesta dal dialog "Nuova richiesta"; restituisce l'id letto dalla risposta. */
const submitRequest = async (page: Page, byManager: boolean): Promise<number> => {
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/leave-requests') && response.request().method() === 'POST')
  await page.getByRole('dialog', { name: 'Nuova richiesta' }).getByRole('button', { name: 'Invia richiesta' }).click()
  const response = await responsePromise
  expect(response.status()).toBe(201)
  const { data } = idSchema.parse(await response.json())
  created.push({ id: data.id, byManager })
  await expect(page.getByRole('dialog', { name: 'Nuova richiesta' })).toHaveCount(0)
  return data.id
}

const openNewRequest = async (page: Page, type: string): Promise<Locator> => {
  await page.getByRole('button', { name: 'Nuova richiesta' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuova richiesta' })
  await dialog.getByRole('combobox', { name: 'Tipo di assenza' }).click()
  await page.getByRole('option', { name: type, exact: true }).click()
  return dialog
}

/** Riga di Da approvare di una persona in un dato periodo (il nome e il periodo sono nell'etichetta dei pulsanti). */
const approvalButton = (panel: Locator, action: string, name: string, period: string): Locator =>
  panel.getByRole('button', { name: `${action}, ${name}, ${period}`, exact: true })

/** Azione sul dettaglio di una richiesta aperta dal calendario, con la conferma. */
const confirmInDetail = async (page: Page, action: string): Promise<void> => {
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: action, exact: true }).click({ timeout: 15_000 })
  await dialog.getByRole('group').getByRole('button', { name: action, exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

const chip = (page: Page, type: string, status: string): Locator => page.getByRole('button', { name: `${type}, ${status}: apri il dettaglio` }).first()

const stateSchema = z.object({ data: z.object({ status: z.string() }) })

/** Porta una richiesta di prova in uno stato finale (rifiutata, ritirata o annullata), qualunque sia lo stato in cui l'ha lasciata il test. */
const settle = async (page: Page, id: number, ownerIsManager: boolean): Promise<void> => {
  for (let step = 0; step < 4; step += 1) {
    const response = await api(page, 'GET', `/api/leave-requests/${id}`)
    if (response.status() !== 200) throw new Error(`richiesta ${id}: HTTP ${response.status()}`)
    const { status } = stateSchema.parse(await response.json()).data
    let path: string | null = null
    if (status === 'pending') path = ownerIsManager ? 'withdraw' : 'reject'
    else if (status === 'approved') path = ownerIsManager ? 'cancellation' : 'cancel'
    else if (status === 'cancellation_requested') path = 'cancellation/approve'
    if (path === null) return
    const result = await api(page, 'POST', `/api/leave-requests/${id}/${path}`, {})
    if (result.status() >= 400) throw new Error(`richiesta ${id}, ${path}: HTTP ${result.status()}`)
  }
  throw new Error(`richiesta ${id} non arriva a uno stato finale`)
}

const newContext = async (): Promise<BrowserContext> => {
  const context = await browserRef.newContext({ baseURL, locale: 'it-IT' })
  contexts.push(context)
  return context
}

test.beforeAll(async ({ browser }, workerInfo) => {
  test.setTimeout(120_000)
  browserRef = browser
  baseURL = String(workerInfo.project.use.baseURL)
  dates = computeDates(new Date())
  // Un accesso per persona: la casella si svuota prima di ciascuno per leggere il codice giusto
  await clearInbox()
  sara = await (await newContext()).newPage()
  trackRateLimit(sara)
  await signIn(sara, EMPLOYEE, PASSWORD)
  await clearInbox()
  manager = await (await newContext()).newPage()
  trackRateLimit(manager)
  await signIn(manager, MANAGER, PASSWORD)
})

test.afterAll(async () => {
  test.setTimeout(API_RETRY_TIMEOUT)
  const errors: string[] = []
  for (const { id, byManager } of created) {
    // Le richieste di Sara si sistemano come responsabile; quelle del responsabile le sistema lui come proprietario
    try {
      await settle(manager, id, byManager)
    } catch (error) {
      errors.push(String(error))
    }
  }
  await Promise.all(contexts.map((context) => context.close()))
  if (errors.length > 0) throw new Error(`Pulizia incompleta: ${errors.join('; ')}`)
})

test('Sara asks two days of vacation and sees the preview with hours and balance', async () => {
  await ensureBudget(sara)
  await goHome(sara)
  plannedBefore = await plannedHours(sara)
  await expectNoViolationsInBothSchemes(sara)

  await goLeave(sara)
  await showTestMonth(sara)
  const dialog = await openNewRequest(sara, VACATION)
  await dialog.getByLabel('Dal', { exact: true }).fill(dates.mondayStart)
  await dialog.getByLabel('Al', { exact: true }).fill(dates.mondayEnd)
  const preview = dialog.getByRole('region', { name: 'Anteprima' })
  await expect(preview).toContainText(new RegExp(`(^|\\D)${VACATION_HOURS} h`))
  await expect(preview).toContainText(`${VACATION_DAYS}`)
  await submitRequest(sara, false)

  await expect(chip(sara, VACATION, 'In attesa')).toBeVisible()
})

test('the manager approves it from Da approvare', async () => {
  await ensureBudget(manager)
  const panel = await goApprovals(manager, true)
  const period = periodText(dates.mondayStart, dates.mondayEnd)
  const approve = approvalButton(panel, 'Approva', EMPLOYEE_NAME, period)
  await expect(approve).toBeVisible()
  await expectNoViolationsInBothSchemes(manager)
  await approve.click()
  await expect(approve).toHaveCount(0)
})

test('Sara sees the green request with the manager name and the planned hours go up', async () => {
  await ensureBudget(sara, BUDGET_HEAVY)
  await goLeave(sara, true)
  await showTestMonth(sara)
  const approved = chip(sara, VACATION, 'Approvata')
  await expect(approved).toBeVisible()
  await expect(approved).toHaveAttribute('data-status', 'approved')
  await expect(approved).toHaveClass(/bg-leave-approved/)
  await expectNoViolationsInBothSchemes(sara)
  await approved.click()
  const dialog = sara.getByRole('dialog')
  await expect(dialog.getByText(new RegExp(`^${MANAGER_NAME}, `))).toBeVisible()
  await sara.keyboard.press('Escape')
  await expect(sara.getByRole('dialog')).toHaveCount(0)

  await goHome(sara, true)
  await expect.poll(() => plannedHours(sara)).toBe(plannedBefore + VACATION_HOURS)
})

test('Sara asks the cancellation, the manager approves it and the planned hours come back', async () => {
  await ensureBudget(sara, BUDGET_HEAVY)
  await ensureBudget(manager)
  await goLeave(sara)
  await showTestMonth(sara)
  await chip(sara, VACATION, 'Approvata').click()
  await confirmInDetail(sara, 'Chiedi annullamento')
  await expect(chip(sara, VACATION, 'Annullamento richiesto')).toBeVisible()

  const panel = await goApprovals(manager, true)
  const period = periodText(dates.mondayStart, dates.mondayEnd)
  const approveCancellation = approvalButton(panel, 'Approva annullamento', EMPLOYEE_NAME, period)
  await expect(approveCancellation).toBeVisible()
  await approveCancellation.click()
  await expect(approveCancellation).toHaveCount(0)

  await goHome(sara, true)
  await expect.poll(() => plannedHours(sara)).toBe(plannedBefore)
})

test('the manager asks 2 hours of ROL and approves them himself, then takes them back', async () => {
  await ensureBudget(manager, BUDGET_HEAVY)
  await goLeave(manager)
  await showTestMonth(manager)
  const dialog = await openNewRequest(manager, ROL)
  await dialog.getByLabel('Giorno', { exact: true }).fill(dates.friday)
  await dialog.getByRole('combobox', { name: 'Dalle', exact: true }).click()
  await manager.getByRole('option', { name: '09:00', exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Alle', exact: true }).click()
  await manager.getByRole('option', { name: '11:00', exact: true }).click()
  await expect(dialog.getByRole('region', { name: 'Anteprima' })).toContainText(new RegExp(`(^|\\D)${ROL_HOURS} h`))
  await submitRequest(manager, true)

  const panel = await goApprovals(manager, true)
  const period = `${periodText(dates.friday, dates.friday)}, dalle 09:00 alle 11:00`
  const approve = approvalButton(panel, 'Approva', MANAGER_NAME, period)
  await expect(approve).toBeVisible()
  await approve.click()
  await expect(approve).toHaveCount(0)

  // Prova che sia approvata, poi la ritira dall'elenco di chi chiede: annullamento chiesto e approvato da lui stesso
  await manager.getByRole('tab', { name: /^Il mio calendario/ }).click()
  await showTestMonth(manager)
  await chip(manager, ROL, 'Approvata').click()
  await confirmInDetail(manager, 'Chiedi annullamento')
  const again = await goApprovals(manager, true)
  const approveCancellation = approvalButton(again, 'Approva annullamento', MANAGER_NAME, period)
  await expect(approveCancellation).toBeVisible()
  await approveCancellation.click()
  await expect(approveCancellation).toHaveCount(0)
})

test('a rejected request reaches Sara with the reason on Mailpit', async () => {
  await ensureBudget(sara, BUDGET_HEAVY)
  await ensureBudget(manager)
  const reason = `Periodo coperto ${Date.now()}`
  await goLeave(sara)
  await showTestMonth(sara)
  const dialog = await openNewRequest(sara, VACATION)
  await dialog.getByLabel('Dal', { exact: true }).fill(dates.rejectedStart)
  await dialog.getByLabel('Al', { exact: true }).fill(dates.rejectedEnd)
  await expect(dialog.getByRole('region', { name: 'Anteprima' })).toContainText(new RegExp(`(^|\\D)${VACATION_HOURS} h`))
  await submitRequest(sara, false)

  const panel = await goApprovals(manager, true)
  const period = periodText(dates.rejectedStart, dates.rejectedEnd)
  await clearInbox()
  await approvalButton(panel, 'Rifiuta', EMPLOYEE_NAME, period).click()
  const reject = manager.getByRole('dialog', { name: 'Rifiuta la richiesta' })
  await reject.getByLabel('Motivo (facoltativo)').fill(reason)
  await reject.getByRole('button', { name: 'Rifiuta', exact: true }).click()
  await expect(manager.getByRole('dialog')).toHaveCount(0)
  await expect(approvalButton(panel, 'Rifiuta', EMPLOYEE_NAME, period)).toHaveCount(0)

  // waitForText lancia se l'email non arriva entro il timeout
  await waitForText(EMPLOYEE, new RegExp(`Motivo: (${reason})`))

  // Sara la vede tra le sue richieste come non approvata
  await ensureBudget(sara, BUDGET_LIGHT)
  await goLeave(sara, true)
  await showTestMonth(sara)
  await expect(chip(sara, VACATION, 'Non approvata')).toBeVisible()
})
