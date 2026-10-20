import { screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LeaveRequestDialog from '@/features/leave/components/LeaveRequestDialog'
import { absenceTypeOption } from '@/test/absenceTypesFixtures'
import { expectNoA11yViolations } from '@/test/axe'
import { leavePreview, leaveRequest } from '@/test/leaveFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const types = [
  absenceTypeOption({ id: 1, name: 'Ferie', allows_days: true, allows_half_days: true, allows_hours: false, balance: 'vacation' }),
  absenceTypeOption({ id: 2, name: 'ROL', allows_days: false, allows_half_days: false, allows_hours: true, balance: 'rol' }),
  absenceTypeOption({ id: 3, name: 'Congedo matrimoniale', allows_days: true, allows_half_days: false, allows_hours: false, balance: null, day_count: 'calendar' }),
]

let previews: unknown[] = []

const renderDialog = (range: { startsOn: string; endsOn: string } | null = { startsOn: '2026-10-26', endsOn: '2026-10-28' }) => {
  const onClose = vi.fn()
  const view = renderRoutes([{ path: '/', element: <LeaveRequestDialog open range={range} returnFocusTo={null} onClose={onClose} /> }])
  return { ...view, onClose }
}

const findDialog = () => screen.findByRole('dialog', { name: 'Nuova richiesta' })

const chooseType = async (user: ReturnType<typeof renderDialog>['user'], name: string) => {
  await user.click(await screen.findByRole('combobox', { name: 'Tipo di assenza' }))
  await user.click(await screen.findByRole('option', { name }))
}

describe('LeaveRequestDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0))
    previews = []
    server.use(
      http.get('/api/profile/absence-types', () => HttpResponse.json({ data: types })),
      http.post('/api/leave-requests/preview', async ({ request }) => {
        previews.push(await request.json())
        return HttpResponse.json({ data: leavePreview() })
      }),
    )
  })
  afterEach(() => vi.useRealTimers())

  it('offers only the profile types and the units each type allows', async () => {
    const { user } = renderDialog()
    const dialog = await findDialog()

    await user.click(within(dialog).getByRole('combobox', { name: 'Tipo di assenza' }))
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Ferie', 'ROL', 'Congedo matrimoniale'])
    await user.click(screen.getByRole('option', { name: 'Ferie' }))

    const units = within(dialog).getByRole('radiogroup', { name: 'Unità' })
    expect(within(units).getAllByRole('radio')).toHaveLength(2)
    expect(within(units).getByRole('radio', { name: 'Giornate intere' })).toBeChecked()
    expect(within(units).getByRole('radio', { name: 'Mezza giornata' })).toBeInTheDocument()
    expect(within(units).queryByRole('radio', { name: 'Ore' })).not.toBeInTheDocument()

    await chooseType(user, 'ROL')
    expect(within(dialog).getByRole('radio', { name: 'Ore' })).toBeChecked()
    expect(within(dialog).queryByRole('radio', { name: 'Giornate intere' })).not.toBeInTheDocument()
  })

  it('offers two date fields as an alternative to the calendar', async () => {
    const { user } = renderDialog(null)
    const dialog = await findDialog()
    await chooseType(user, 'Ferie')

    const from = within(dialog).getByLabelText('Dal')
    const to = within(dialog).getByLabelText('Al')
    expect(from).toHaveValue('')
    expect(to).toHaveValue('')
    await user.type(from, '2026-11-02')
    await user.type(to, '2026-11-03')

    await waitFor(() => expect(previews.at(-1)).toEqual({ absence_type_id: 1, unit: 'days', starts_on: '2026-11-02', ends_on: '2026-11-03' }))
  })

  it('asks for morning or afternoon on a single day for half days', async () => {
    const { user } = renderDialog()
    const dialog = await findDialog()
    await chooseType(user, 'Ferie')

    await user.click(within(dialog).getByRole('radio', { name: 'Mezza giornata' }))
    expect(within(dialog).queryByLabelText('Al')).not.toBeInTheDocument()
    expect(within(dialog).getByLabelText('Giorno')).toHaveValue('2026-10-26')
    expect(within(dialog).getByText('Mezze giornate e ore valgono per un solo giorno.')).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: 'Mattina' })).toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: 'Pomeriggio' }))

    await waitFor(() => expect(previews.at(-1)).toEqual({ absence_type_id: 1, unit: 'half_day', starts_on: '2026-10-26', ends_on: '2026-10-26', half: 'afternoon' }))
  })

  it('asks for hours from–to in 30-minute steps', async () => {
    const { user } = renderDialog()
    const dialog = await findDialog()
    await chooseType(user, 'ROL')

    await user.click(within(dialog).getByRole('combobox', { name: 'Dalle' }))
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(48)
    expect(options.slice(17, 20).map((option) => option.textContent)).toEqual(['08:30', '09:00', '09:30'])
    await user.click(screen.getByRole('option', { name: '09:00' }))
    await user.click(within(dialog).getByRole('combobox', { name: 'Alle' }))
    await user.click(await screen.findByRole('option', { name: '11:30' }))

    await waitFor(() =>
      expect(previews.at(-1)).toEqual({ absence_type_id: 2, unit: 'hours', starts_on: '2026-10-26', ends_on: '2026-10-26', starts_at: '09:00', ends_at: '11:30' }),
    )
  })

  it('shows hours, days, balance after and warnings, and still lets the person send', async () => {
    server.use(
      http.post('/api/leave-requests/preview', async ({ request }) => {
        previews.push(await request.json())
        return HttpResponse.json({
          data: leavePreview({
            minutes: 1440,
            working_days: 3,
            balance: { balance: 'vacation', current_minutes: 1500, available_minutes: 1260, after_minutes: -180 },
            warnings: [
              { code: 'balance_insufficient', params: { after_minutes: -180 } },
              { code: 'limit_exceeded', params: { limit: 3, unit: 'days', period: 'month', total: 4.5 } },
            ],
          }),
        })
      }),
    )
    const { user } = renderDialog()
    const dialog = await findDialog()
    await chooseType(user, 'Ferie')
    await user.type(within(dialog).getByLabelText('Nota (facoltativa)'), 'Viaggio')

    const preview = within(dialog).getByRole('region', { name: 'Anteprima' })
    expect(await within(preview).findByText('24 h')).toBeInTheDocument()
    expect(within(preview).getByText('3')).toBeInTheDocument()
    expect(within(preview).getByText('Ferie disponibili')).toBeInTheDocument()
    expect(within(preview).getByText('21 h')).toBeInTheDocument()
    expect(within(preview).getByText('Ferie dopo la richiesta')).toBeInTheDocument()
    expect(within(preview).getByText('−3 h')).toBeInTheDocument()
    expect(within(preview).getByText('Saldo insufficiente: dopo la richiesta resterebbero −3 h.')).toBeInTheDocument()
    expect(within(preview).getByText('Limite del tipo superato (3 giorni al mese): con questa richiesta si arriva a 4,5 giorni.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Invia richiesta' })).toBeEnabled()
    // La nota non entra nell'anteprima: nessuna lettura a ogni carattere
    expect(previews.every((body) => typeof body === 'object' && body !== null && !('note' in body))).toBe(true)
    await expectNoA11yViolations(document.body)
  })

  it('never shows outdated warnings and waits for the new preview before sending', async () => {
    let calls = 0
    server.use(
      http.post('/api/leave-requests/preview', async () => {
        calls += 1
        if (calls > 1) await delay('infinite')
        return HttpResponse.json({ data: leavePreview({ warnings: [{ code: 'balance_insufficient', params: { after_minutes: -60 } }] }) })
      }),
    )
    const { user } = renderDialog()
    const dialog = await findDialog()
    await chooseType(user, 'Ferie')
    expect(await within(dialog).findByText('Saldo insufficiente: dopo la richiesta resterebbero −1 h.')).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText('Al'))
    await user.type(within(dialog).getByLabelText('Al'), '2026-10-29')

    expect(await within(dialog).findByText('Calcolo in corso…')).toBeInTheDocument()
    expect(within(dialog).queryByText(/Saldo insufficiente/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Invia richiesta' })).toBeDisabled()
  })

  it('shows server errors on the fields, overlap included', async () => {
    server.use(
      http.post('/api/leave-requests', () =>
        HttpResponse.json({ message: 'Errore', errors: { starts_on: ['Hai già una richiesta in questi giorni.'], half: ['Scegli la metà.'] } }, { status: 422 }),
      ),
    )
    const { user, onClose } = renderDialog()
    const dialog = await findDialog()
    await chooseType(user, 'Ferie')
    await within(dialog).findByText('16 h')

    await user.click(within(dialog).getByRole('button', { name: 'Invia richiesta' }))

    const from = within(dialog).getByLabelText('Dal')
    await waitFor(() => expect(from).toHaveAccessibleDescription('Hai già una richiesta in questi giorni.'))
    expect(from).toHaveAttribute('aria-invalid', 'true')
    expect(from).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('validates the form before sending', async () => {
    let sent = false
    server.use(http.post('/api/leave-requests', () => ((sent = true), HttpResponse.json({}, { status: 500 }))))
    const { user } = renderDialog(null)
    const dialog = await findDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Invia richiesta' }))

    expect(await within(dialog).findByText('Scegli il tipo di assenza.')).toBeInTheDocument()
    expect(within(dialog).getAllByText('Inserisci una data valida.')).toHaveLength(2)
    expect(sent).toBe(false)
  })

  it('sends the request with the note, shows a toast and closes', async () => {
    let body: unknown = null
    server.use(
      http.post('/api/leave-requests', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: leaveRequest({ starts_on: '2026-10-26', ends_on: '2026-10-28' }) }, { status: 201 })
      }),
    )
    const { user, onClose } = renderDialog()
    const dialog = await findDialog()
    await chooseType(user, 'Ferie')
    await user.type(within(dialog).getByLabelText('Nota (facoltativa)'), 'Viaggio')
    await within(dialog).findByText('16 h')

    await user.click(within(dialog).getByRole('button', { name: 'Invia richiesta' }))

    await waitFor(() => expect(body).toEqual({ absence_type_id: 1, unit: 'days', starts_on: '2026-10-26', ends_on: '2026-10-28', note: 'Viaggio' }))
    expect(await screen.findByText('Richiesta inviata: Ferie, 26–28 ottobre 2026')).toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })
})
