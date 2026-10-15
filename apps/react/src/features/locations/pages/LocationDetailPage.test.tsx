import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import { todayIn } from '@/features/locations/scheduleFormat'
import LocationDetailPage from '@/features/locations/pages/LocationDetailPage'
import { expectNoA11yViolations } from '@/test/axe'
import { closure, locationDetail, schedule } from '@/test/locationsFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/admin/locations', element: <h1>Sedi</h1> },
  { path: '/admin/locations/:id', element: <LocationDetailPage /> },
]

const thisYear = Number(todayIn('Europe/Rome').slice(0, 4))

const detail = (
  {
    calendarUrls = [],
    closures = [closure({ id: 1, location_id: null, description: 'Chiusura estiva' }), closure({ id: 2, location_id: 1, location_name: 'Sede principale', starts_on: `${thisYear}-12-24`, ends_on: `${thisYear}-12-24`, description: 'Vigilia' })],
  }: { calendarUrls?: URL[]; closures?: ReturnType<typeof closure>[] } = {},
) =>
  server.use(
    http.get('/api/locations/1', () => HttpResponse.json({ data: locationDetail() })),
    http.get('/api/locations/1/schedules', () =>
      HttpResponse.json({ data: [schedule({ id: 4, valid_from: '2099-01-01', is_started: false, minutes: [480, 480, 480, 480, 240, 0, 0] }), schedule()] }),
    ),
    http.get('/api/closures', () => HttpResponse.json({ data: closures })),
    http.get('/api/locations/1/calendar', ({ request }) => {
      const url = new URL(request.url)
      calendarUrls.push(url)
      const year = Number(url.searchParams.get('year'))
      return HttpResponse.json({
        data: {
          year,
          schedules: [schedule()],
          days: [
            { date: `${year}-03-29`, reasons: [{ type: 'national_holiday', label: 'Lunedì dell’Angelo' }] },
            { date: `${year}-12-07`, reasons: [{ type: 'patron', label: 'Patrono della sede' }] },
          ],
        },
      })
    }),
  )

/** Giorno dopo, calcolato qui senza l'helper del codice */
const tomorrowOf = (day: string): string => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)

const card = (name: string): HTMLElement => {
  const section = screen.getByRole('heading', { level: 2, name }).closest('section')
  if (!section) throw new Error(`Blocco ${name} mancante`)
  return section
}

describe('LocationDetailPage', () => {
  it('shows data, standard schedule, closures and the non-working days of the year', async () => {
    detail()
    renderRoutes(routes, ['/admin/locations/1'])

    expect(await screen.findByRole('heading', { level: 1, name: 'Sede principale' })).toBeInTheDocument()
    expect(screen.getByText('Principale')).toBeInTheDocument()
    const data = card('Dati')
    expect(within(data).getByText('07/12')).toBeInTheDocument()
    const hours = card('Orario standard')
    expect(within(hours).getAllByText('8 h').length).toBeGreaterThan(0)
    expect(await within(hours).findByText('In arrivo')).toBeInTheDocument()
    const closures = card('Chiusure')
    expect(await within(closures).findByText('Chiusura estiva')).toBeInTheDocument()
    expect(within(closures).getByText('Tutte le sedi')).toBeInTheDocument()
    const calendar = card('Calendario dell’anno')
    expect(await within(calendar).findByText('Lunedì dell’Angelo')).toBeInTheDocument()
    expect(within(calendar).getByText('Patrono della sede')).toBeInTheDocument()
    expect(within(calendar).getByText('Riposo settimanale: sabato, domenica.')).toBeInTheDocument()
  })

  it('edits name, city and patron', async () => {
    detail()
    let body: unknown = null
    server.use(
      http.patch('/api/locations/1', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: locationDetail({ name: 'Milano Centro' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByRole('heading', { level: 1, name: 'Sede principale' })
    await user.click(within(card('Dati')).getByRole('button', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Sede principale' })
    expect(within(dialog).getByLabelText('Patrono (giorno/mese)')).toHaveValue('07/12')
    await user.clear(within(dialog).getByLabelText('Nome'))
    await user.type(within(dialog).getByLabelText('Nome'), 'Milano Centro')
    await user.clear(within(dialog).getByLabelText('Patrono (giorno/mese)'))
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Sede Milano Centro aggiornata.')).toBeInTheDocument()
    expect(body).toEqual({ name: 'Milano Centro', city: 'Milano', patron_day: null, patron_month: null })
  })

  it('shows the server errors of the edit under the fields and keeps the dialog open', async () => {
    detail()
    server.use(
      http.patch('/api/locations/1', () =>
        HttpResponse.json({ message: 'x', errors: { name: ['Esiste già una sede con questo nome.'], patron_day: ['Il patrono non è una data valida.'] } }, { status: 422 }),
      ),
    )
    const { user } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByRole('heading', { level: 1, name: 'Sede principale' })
    await user.click(within(card('Dati')).getByRole('button', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Sede principale' })
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await within(dialog).findByText('Esiste già una sede con questo nome.')).toBeInTheDocument()
    expect(within(dialog).getByText('Il patrono non è una data valida.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Nome')).toHaveFocus()
    expect(screen.getByRole('dialog', { name: 'Modifica Sede principale' })).toBeInTheDocument()
  })

  it('shows a Sunday holiday with every reason of the day', async () => {
    server.use(
      http.get('/api/locations/1', () => HttpResponse.json({ data: locationDetail() })),
      http.get('/api/locations/1/schedules', () => HttpResponse.json({ data: [schedule()] })),
      http.get('/api/closures', () => HttpResponse.json({ data: [] })),
      http.get('/api/locations/1/calendar', ({ request }) => {
        const year = Number(new URL(request.url).searchParams.get('year'))
        return HttpResponse.json({
          data: {
            year,
            schedules: [schedule()],
            days: [{ date: `${year}-04-05`, reasons: [{ type: 'weekly_rest', label: 'Riposo settimanale' }, { type: 'national_holiday', label: 'Pasqua' }] }],
          },
        })
      }),
    )
    renderRoutes(routes, ['/admin/locations/1'])

    const calendar = await screen.findByRole('heading', { level: 2, name: 'Calendario dell’anno' })
    const section = calendar.closest('section')
    expect(await within(section as HTMLElement).findByText('Riposo settimanale · Pasqua')).toBeInTheDocument()
  })

  it('shows an alert when the schedule versions fail to load and recovers on retry', async () => {
    detail()
    server.use(http.get('/api/locations/1/schedules', () => HttpResponse.json({ message: 'x' }, { status: 500 })))
    const { user } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByRole('heading', { level: 1, name: 'Sede principale' })
    const hours = card('Orario standard')
    expect(await within(hours).findByText('Non è stato possibile caricare le versioni dell’orario.')).toBeInTheDocument()

    server.use(http.get('/api/locations/1/schedules', () => HttpResponse.json({ data: [schedule({ id: 4, valid_from: '2099-01-01', is_started: false }), schedule()] })))
    await user.click(within(hours).getByRole('button', { name: 'Riprova' }))

    expect(await within(hours).findByText('In arrivo')).toBeInTheDocument()
    expect(within(hours).queryByText('Non è stato possibile caricare le versioni dell’orario.')).not.toBeInTheDocument()
  })

  it('changes the schedule from a future day and refuses past days and empty weeks', async () => {
    detail()
    let body: unknown = null
    server.use(
      http.post('/api/locations/1/schedules', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: schedule({ id: 9, valid_from: '2099-02-01', is_started: false }) }, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByRole('heading', { level: 1, name: 'Sede principale' })
    await user.click(within(card('Orario standard')).getByRole('button', { name: 'Cambia orario' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cambia orario di Sede principale' })
    // Parte da oggi, nel fuso della sede
    expect(within(dialog).getByLabelText('Vale dal')).toHaveValue(todayIn('Europe/Rome'))

    fireEvent.change(within(dialog).getByLabelText('Vale dal'), { target: { value: '2000-01-01' } })
    await user.click(within(dialog).getByRole('button', { name: 'Salva orario' }))
    expect(await within(dialog).findByText('Scegli oggi o una data futura.')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Vale dal'), { target: { value: '2099-02-01' } })
    for (const day of ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì']) await user.click(within(dialog).getByRole('checkbox', { name: day }))
    await user.click(within(dialog).getByRole('button', { name: 'Salva orario' }))
    expect(await within(dialog).findByText('Almeno un giorno deve essere lavorativo.')).toBeInTheDocument()
    expect(body).toBeNull()

    await user.click(within(dialog).getByRole('checkbox', { name: 'Lunedì' }))
    await user.click(within(dialog).getByRole('checkbox', { name: 'Sabato' }))
    await user.clear(within(dialog).getByLabelText('Ore di sabato'))
    await user.type(within(dialog).getByLabelText('Ore di sabato'), '4')
    await user.click(within(dialog).getByRole('button', { name: 'Salva orario' }))

    expect(await screen.findByText('Nuovo orario salvato: vale dal 1 febbraio 2099.')).toBeInTheDocument()
    expect(body).toEqual({ valid_from: '2099-02-01', minutes: [480, 0, 0, 0, 0, 240, 0] })
  })

  it('proposes tomorrow when the schedule in force starts today, which cannot be replaced', async () => {
    const today = todayIn('Europe/Rome')
    detail()
    server.use(http.get('/api/locations/1', () => HttpResponse.json({ data: locationDetail({ current_schedule: schedule({ valid_from: today }) }) })))
    const { user } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByRole('heading', { level: 1, name: 'Sede principale' })
    await user.click(within(card('Orario standard')).getByRole('button', { name: 'Cambia orario' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cambia orario di Sede principale' })
    expect(within(dialog).getByLabelText('Vale dal')).toHaveValue(tomorrowOf(today))
    expect(within(dialog).getByLabelText('Vale dal')).toHaveAttribute('min', today)
  })

  it('deletes a schedule that has not started yet', async () => {
    detail()
    let deleted = false
    server.use(
      http.delete('/api/locations/1/schedules/4', () => {
        deleted = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByRole('heading', { level: 1, name: 'Sede principale' })
    await user.click(await within(card('Orario standard')).findByRole('button', { name: 'Elimina l’orario dal 1 gennaio 2099' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Eliminare l’orario dal 1 gennaio 2099?' })
    await user.click(within(dialog).getByRole('button', { name: 'Elimina' }))

    expect(await screen.findByText('Orario dal 1 gennaio 2099 eliminato.')).toBeInTheDocument()
    expect(deleted).toBe(true)
  })

  it('adds a company-wide closure and refuses closures longer than 31 days', async () => {
    detail({ closures: [] })
    let body: unknown = null
    server.use(
      http.post('/api/closures', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: closure() }, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByRole('heading', { level: 1, name: 'Sede principale' })
    await user.click(within(card('Chiusure')).getByRole('button', { name: 'Aggiungi chiusura' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nuova chiusura' })
    await user.click(within(dialog).getByRole('radio', { name: 'Tutte le sedi' }))
    fireEvent.change(within(dialog).getByLabelText('Dal'), { target: { value: `${thisYear}-08-01` } })
    fireEvent.change(within(dialog).getByLabelText('Al'), { target: { value: `${thisYear}-09-15` } })
    await user.type(within(dialog).getByLabelText('Descrizione'), 'Chiusura estiva')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))
    expect(await within(dialog).findByText('Una chiusura dura al massimo 31 giorni.')).toBeInTheDocument()

    fireEvent.change(within(dialog).getByLabelText('Al'), { target: { value: `${thisYear}-08-21` } })
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Chiusura aggiunta.')).toBeInTheDocument()
    expect(body).toEqual({ location_id: null, starts_on: `${thisYear}-08-01`, ends_on: `${thisYear}-08-21`, description: 'Chiusura estiva' })
  })

  it('reads the calendar of the chosen year', async () => {
    const urls: URL[] = []
    detail({ calendarUrls: urls })
    const { user } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByRole('heading', { level: 1, name: 'Sede principale' })
    const calendar = card('Calendario dell’anno')
    await user.click(within(calendar).getByRole('combobox', { name: 'Anno' }))
    await user.click(await screen.findByRole('option', { name: String(thisYear + 1) }))

    await waitFor(() => expect(urls.at(-1)?.searchParams.get('year')).toBe(String(thisYear + 1)))
  })

  it('says when the location does not exist', async () => {
    server.use(http.get('/api/locations/99', () => HttpResponse.json({ message: 'Not found.' }, { status: 404 })))
    renderRoutes(routes, ['/admin/locations/99'])

    expect(await screen.findByText('Sede non trovata.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tutte le sedi/ })).toHaveAttribute('href', '/admin/locations')
  })

  it('has no accessibility violations', async () => {
    detail()
    const { container } = renderRoutes(routes, ['/admin/locations/1'])

    await screen.findByText('Lunedì dell’Angelo')
    await expectNoA11yViolations(container)
  })
})
