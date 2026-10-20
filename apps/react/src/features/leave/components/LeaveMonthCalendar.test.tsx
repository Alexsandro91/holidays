import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeaveRequest, ProfileCalendar } from '@/features/leave/api'
import { addDays } from '@/features/leave/calendarDates'
import LeaveMonthCalendar from '@/features/leave/components/LeaveMonthCalendar'
import { expectNoA11yViolations } from '@/test/axe'
import { leaveRequest } from '@/test/leaveFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

/** Giorni dell'intervallo: sabato e domenica non lavorativi, il 28 ottobre chiusura aziendale. */
const calendarDays = (from: string, to: string): ProfileCalendar['days'] => {
  const days: ProfileCalendar['days'] = []
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
    if (weekday === 0 || weekday === 6) days.push({ date, minutes: 0, reasons: [{ type: 'weekly_rest', label: 'Riposo settimanale' }] })
    else if (date === '2026-10-28') days.push({ date, minutes: 0, reasons: [{ type: 'closure', label: 'Chiusura aziendale' }] })
    else days.push({ date, minutes: 480, reasons: [] })
  }
  return days
}

const requests: LeaveRequest[] = [
  leaveRequest({ id: 1, status: 'pending', starts_on: '2026-10-26', ends_on: '2026-10-27' }),
  leaveRequest({ id: 2, status: 'approved', starts_on: '2026-10-29', ends_on: '2026-10-29' }),
  leaveRequest({ id: 3, status: 'rejected', starts_on: '2026-10-30', ends_on: '2026-10-30' }),
  leaveRequest({ id: 4, status: 'cancellation_requested', starts_on: '2026-10-22', ends_on: '2026-10-22' }),
  leaveRequest({ id: 5, status: 'withdrawn', starts_on: '2026-10-21', ends_on: '2026-10-21' }),
  leaveRequest({ id: 6, status: 'cancelled', starts_on: '2026-10-23', ends_on: '2026-10-23' }),
]

const ranges: string[] = []

const renderCalendar = () => {
  const onSelectRange = vi.fn()
  const onOpenRequest = vi.fn()
  const view = renderRoutes([{ path: '/', element: <LeaveMonthCalendar onSelectRange={onSelectRange} onOpenRequest={onOpenRequest} /> }])
  return { ...view, onSelectRange, onOpenRequest }
}

const findGrid = (name = 'ottobre 2026') => screen.findByRole('grid', { name })
const cell = (name: RegExp) => screen.getByRole('gridcell', { name })

describe('LeaveMonthCalendar', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0))
    ranges.length = 0
    server.use(
      http.get('/api/profile/calendar', ({ request }) => {
        const url = new URL(request.url)
        const from = url.searchParams.get('from') ?? ''
        const to = url.searchParams.get('to') ?? ''
        ranges.push(`${from}/${to}`)
        return HttpResponse.json({ data: { days: calendarDays(from, to), requests: from === '2026-10-01' ? requests : [] } })
      }),
    )
  })
  afterEach(() => vi.useRealTimers())

  it('lays out the month with Monday first', async () => {
    renderCalendar()
    const grid = await findGrid()

    const headers = within(grid).getAllByRole('columnheader')
    expect(headers).toHaveLength(7)
    expect(headers[0]).toHaveAccessibleName('lunedì')
    expect(headers[6]).toHaveAccessibleName('domenica')
    const firstWeek = within(within(grid).getAllByRole('row')[1]).getAllByRole('gridcell')
    expect(firstWeek).toHaveLength(7)
    expect(firstWeek[3]).toHaveAccessibleName(/^giovedì 1 ottobre 2026/)
    expect(ranges).toEqual(['2026-10-01/2026-10-31'])
  })

  it('shows non-working days in grey with the reason in the cell name', async () => {
    renderCalendar()
    await findGrid()

    await waitFor(() => expect(cell(/^sabato 24 ottobre 2026/)).toHaveAccessibleName('sabato 24 ottobre 2026, Riposo settimanale'))
    expect(cell(/^sabato 24 ottobre 2026/)).toHaveAttribute('data-non-working', 'true')
    expect(cell(/^mercoledì 28 ottobre 2026/)).toHaveAccessibleName('mercoledì 28 ottobre 2026, Chiusura aziendale')
    expect(cell(/^mercoledì 28 ottobre 2026/)).toHaveTextContent('Chiusura aziendale')
    expect(cell(/^martedì 20 ottobre 2026/)).toHaveAccessibleName('martedì 20 ottobre 2026, oggi')
    expect(cell(/^martedì 20 ottobre 2026/)).not.toHaveAttribute('data-non-working')
  })

  it('colours requests by status and hides withdrawn and cancelled ones', async () => {
    renderCalendar()
    await findGrid()

    await waitFor(() => expect(cell(/^lunedì 26 ottobre 2026/)).toHaveAccessibleName('lunedì 26 ottobre 2026, Ferie: In attesa'))
    expect(within(cell(/^lunedì 26 ottobre 2026/)).getByRole('button', { name: 'Ferie, In attesa: apri il dettaglio' })).toHaveAttribute('data-status', 'pending')
    expect(cell(/^martedì 27 ottobre 2026/)).toHaveAccessibleName('martedì 27 ottobre 2026, Ferie: In attesa')
    expect(cell(/^giovedì 29 ottobre 2026/)).toHaveAccessibleName('giovedì 29 ottobre 2026, Ferie: Approvata')
    expect(cell(/^venerdì 30 ottobre 2026/)).toHaveAccessibleName('venerdì 30 ottobre 2026, Ferie: Non approvata')
    expect(within(cell(/^giovedì 22 ottobre 2026/)).getByRole('button', { name: 'Ferie, Annullamento richiesto: apri il dettaglio' })).toHaveAttribute(
      'data-status',
      'cancellation_requested',
    )
    expect(cell(/^mercoledì 21 ottobre 2026/)).toHaveAccessibleName('mercoledì 21 ottobre 2026')
    expect(cell(/^venerdì 23 ottobre 2026/)).toHaveAccessibleName('venerdì 23 ottobre 2026')
    // Legenda con gli stessi badge degli elenchi
    const legend = screen.getByRole('list', { name: 'Legenda' })
    expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['In attesa', 'Approvata', 'Non approvata', 'Annullamento richiesto', 'Non lavorativo'])
  })

  it('changes the requested range with previous and next month', async () => {
    const { user } = renderCalendar()
    await findGrid()

    await user.click(screen.getByRole('button', { name: 'Mese successivo' }))
    expect(await findGrid('novembre 2026')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mese precedente' }))
    await user.click(screen.getByRole('button', { name: 'Mese precedente' }))
    expect(await findGrid('settembre 2026')).toBeInTheDocument()

    await waitFor(() => expect(ranges).toEqual(['2026-10-01/2026-10-31', '2026-11-01/2026-11-30', '2026-09-01/2026-09-30']))
  })

  it('selects a range by clicking the first and the last day, in any order', async () => {
    const { user, onSelectRange } = renderCalendar()
    await findGrid()

    await user.click(cell(/^mercoledì 28 ottobre 2026/))
    expect(cell(/^mercoledì 28 ottobre 2026/)).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Primo giorno: mercoledì 28 ottobre 2026. Ora scegli l’ultimo giorno.')).toBeInTheDocument()
    await user.click(cell(/^lunedì 26 ottobre 2026/))

    expect(onSelectRange).toHaveBeenCalledWith({ startsOn: '2026-10-26', endsOn: '2026-10-28' }, 'day-2026-10-26')
    expect(cell(/^mercoledì 28 ottobre 2026/)).toHaveAttribute('aria-selected', 'false')
  })

  it('selects with the keyboard: arrows, Enter, and Esc to cancel', async () => {
    const { user, onSelectRange } = renderCalendar()
    await findGrid()
    const today = cell(/^martedì 20 ottobre 2026/)
    expect(today).toHaveAttribute('tabindex', '0')
    today.focus()

    await user.keyboard('{ArrowRight}')
    expect(cell(/^mercoledì 21 ottobre 2026/)).toHaveFocus()
    await user.keyboard('{Enter}{Escape}')
    expect(cell(/^mercoledì 21 ottobre 2026/)).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('Selezione annullata.')).toBeInTheDocument()

    await user.keyboard('{ArrowDown}{Enter}{ArrowRight}{ArrowRight}')
    expect(cell(/^giovedì 29 ottobre 2026/)).toHaveAttribute('aria-selected', 'true')
    expect(cell(/^martedì 27 ottobre 2026/)).toHaveAttribute('aria-selected', 'false')
    await user.keyboard('{Enter}')
    expect(onSelectRange).toHaveBeenCalledWith({ startsOn: '2026-10-28', endsOn: '2026-10-30' }, 'day-2026-10-30')
    expect(cell(/^venerdì 30 ottobre 2026/)).toHaveAttribute('tabindex', '0')
  })

  it('moves to the next month past the last day', async () => {
    const { user } = renderCalendar()
    await findGrid()
    cell(/^martedì 20 ottobre 2026/).focus()

    await user.keyboard('{ArrowDown}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(await findGrid('novembre 2026')).toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: /^domenica 1 novembre 2026/ })).toHaveFocus()
    await user.keyboard('{PageUp}')
    expect(await findGrid('ottobre 2026')).toBeInTheDocument()
    expect(screen.getByRole('gridcell', { name: /^giovedì 1 ottobre 2026/ })).toHaveFocus()
  })

  it('does not select past days', async () => {
    const { user, onSelectRange } = renderCalendar()
    await findGrid()

    const past = cell(/^lunedì 19 ottobre 2026/)
    expect(past).toHaveAttribute('aria-disabled', 'true')
    await user.click(past)
    expect(past).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText('Non si può chiedere un giorno già passato.')).toBeInTheDocument()
    expect(onSelectRange).not.toHaveBeenCalled()
  })

  it('opens a request from the calendar without selecting the day', async () => {
    const { user, onOpenRequest } = renderCalendar()
    await findGrid()

    await user.click(await screen.findByRole('button', { name: 'Ferie, Approvata: apri il dettaglio' }))
    expect(onOpenRequest).toHaveBeenCalledWith(2, 'chip-2-2026-10-29')
    expect(cell(/^giovedì 29 ottobre 2026/)).toHaveAttribute('aria-selected', 'false')
    await expectNoA11yViolations(document.body)
  })
})
