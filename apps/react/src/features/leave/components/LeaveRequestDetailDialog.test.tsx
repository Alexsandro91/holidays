import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { LeaveRequest } from '@/features/leave/api'
import LeaveRequestDetailDialog from '@/features/leave/components/LeaveRequestDetailDialog'
import { expectNoA11yViolations } from '@/test/axe'
import { adminUser, currentUserResponse } from '@/test/fixtures'
import { leaveRequest } from '@/test/leaveFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const NO_ACTIONS: LeaveRequest['can'] = {
  withdraw: false,
  request_cancellation: false,
  approve: false,
  reject: false,
  approve_cancellation: false,
  reject_cancellation: false,
  cancel: false,
}

const days = [
  { date: '2026-10-26', minutes: 480 },
  { date: '2026-10-27', minutes: 240 },
  { date: '2026-10-28', minutes: 0 },
]

const respondWith = (request: LeaveRequest) => {
  let reads = 0
  server.use(
    http.get('/api/leave-requests/5', () => {
      reads += 1
      return HttpResponse.json({ data: request })
    }),
  )
  return { reads: () => reads }
}

const renderDialog = () => {
  const onClose = vi.fn()
  const view = renderRoutes([{ path: '/', element: <LeaveRequestDetailDialog open requestId={5} returnFocusTo={null} onClose={onClose} /> }])
  return { ...view, onClose }
}

const findDialog = () => screen.findByRole('dialog', { name: 'Ferie' })

describe('LeaveRequestDetailDialog', () => {
  it('shows status, who decided and when, note, rejection reason and days', async () => {
    respondWith(
      leaveRequest({
        id: 5,
        status: 'rejected',
        status_label: 'Non approvata',
        starts_on: '2026-10-26',
        ends_on: '2026-10-28',
        minutes: 720,
        working_days: 1.5,
        note: 'Viaggio di famiglia',
        decision_note: 'Settimana di chiusura del progetto',
        decided_by_name: 'Marco Rossi',
        decided_at: '2026-10-21T10:30:00Z',
        days,
        can: NO_ACTIONS,
      }),
    )
    renderDialog()
    const dialog = await findDialog()

    expect(await within(dialog).findByText('Non approvata')).toBeInTheDocument()
    expect(within(dialog).getByText('26–28 ottobre 2026')).toBeInTheDocument()
    expect(within(dialog).getByText('12 h · 1,5 giorni')).toBeInTheDocument()
    expect(within(dialog).getByText(/^Marco Rossi, 21 ottobre 2026/)).toBeInTheDocument()
    expect(within(dialog).getByText('Viaggio di famiglia')).toBeInTheDocument()
    expect(within(dialog).getByText('Motivo del rifiuto')).toBeInTheDocument()
    expect(within(dialog).getByText('Settimana di chiusura del progetto')).toBeInTheDocument()
    const dayList = within(dialog).getByRole('list', { name: 'Giorni' })
    expect(within(dayList).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'lunedì 26 ottobre 20268 h',
      'martedì 27 ottobre 20264 h',
      'mercoledì 28 ottobre 2026non lavorativo',
    ])
    expect(within(dialog).queryByRole('button', { name: 'Ritira' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Chiedi annullamento' })).not.toBeInTheDocument()
    await expectNoA11yViolations(document.body)
  })

  it('describes half days and hours', async () => {
    respondWith(leaveRequest({ id: 5, unit: 'hours', starts_on: '2026-10-26', ends_on: '2026-10-26', starts_at: '09:00', ends_at: '11:30', minutes: 150, working_days: 0.31, days: [] }))
    renderDialog()
    const dialog = await findDialog()

    expect(await within(dialog).findByText('26 ottobre 2026, dalle 09:00 alle 11:30')).toBeInTheDocument()
  })

  it('withdraws a pending request after confirmation', async () => {
    respondWith(leaveRequest({ id: 5, status: 'pending', days, can: { ...NO_ACTIONS, withdraw: true } }))
    let withdrawn = false
    server.use(http.post('/api/leave-requests/5/withdraw', () => ((withdrawn = true), HttpResponse.json({ data: leaveRequest({ id: 5, status: 'withdrawn' }) }))))
    const { user, onClose } = renderDialog()
    const dialog = await findDialog()

    expect(within(dialog).queryByRole('button', { name: 'Chiedi annullamento' })).not.toBeInTheDocument()
    await user.click(await within(dialog).findByRole('button', { name: 'Ritira' }))
    expect(within(dialog).getByText('Ritirare la richiesta? Non si può tornare indietro: per riaverla serve una nuova richiesta.')).toBeInTheDocument()
    expect(withdrawn).toBe(false)
    await user.click(within(dialog).getByRole('button', { name: 'Ritira' }))

    await waitFor(() => expect(withdrawn).toBe(true))
    expect(await screen.findByText('Richiesta ritirata')).toBeInTheDocument()
    expect(onClose).toHaveBeenCalled()
  })

  it('asks for the cancellation of an approved request after confirmation, or goes back', async () => {
    respondWith(leaveRequest({ id: 5, status: 'approved', decided_by_name: 'Marco Rossi', decided_at: '2026-10-21T10:30:00Z', days, can: { ...NO_ACTIONS, request_cancellation: true } }))
    let asked = 0
    server.use(http.post('/api/leave-requests/5/cancellation', () => ((asked += 1), HttpResponse.json({ data: leaveRequest({ id: 5, status: 'cancellation_requested' }) }))))
    const { user } = renderDialog()
    const dialog = await findDialog()

    expect(within(dialog).queryByRole('button', { name: 'Ritira' })).not.toBeInTheDocument()
    await user.click(await within(dialog).findByRole('button', { name: 'Chiedi annullamento' }))
    expect(within(dialog).getByText(/^Chiedere l’annullamento\?/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Indietro' }))
    expect(within(dialog).queryByText(/^Chiedere l’annullamento\?/)).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Chiedi annullamento' })).toHaveFocus()

    await user.click(within(dialog).getByRole('button', { name: 'Chiedi annullamento' }))
    await user.click(within(dialog).getByRole('button', { name: 'Chiedi annullamento' }))
    await waitFor(() => expect(asked).toBe(1))
    expect(await screen.findByText('Annullamento chiesto')).toBeInTheDocument()
  })

  it('shows a 409 as a message and reloads the request', async () => {
    const reads = respondWith(leaveRequest({ id: 5, status: 'approved', days, can: { ...NO_ACTIONS, request_cancellation: true } }))
    server.use(http.post('/api/leave-requests/5/cancellation', () => HttpResponse.json({ message: 'L’assenza è già iniziata.' }, { status: 409 })))
    const { user, onClose } = renderDialog()
    const dialog = await findDialog()

    await user.click(await within(dialog).findByRole('button', { name: 'Chiedi annullamento' }))
    await user.click(within(dialog).getByRole('button', { name: 'Chiedi annullamento' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('L’assenza è già iniziata.')
    await waitFor(() => expect(reads.reads()).toBeGreaterThan(1))
    expect(onClose).not.toHaveBeenCalled()
  })

  describe('as an approver', () => {
    const signIn = () => server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(adminUser, { pendingApprovals: 1 }))))
    const someoneElse = { id: 2, name: 'Sara Colombo' }

    it('cancels directly an approved request of someone else, after confirmation', async () => {
      signIn()
      respondWith(leaveRequest({ id: 5, status: 'approved', user: someoneElse, days, can: { ...NO_ACTIONS, cancel: true } }))
      let cancelled = 0
      server.use(http.post('/api/leave-requests/5/cancel', () => ((cancelled += 1), HttpResponse.json({ data: leaveRequest({ id: 5, status: 'cancelled' }) }))))
      const { user, onClose } = renderDialog()
      const dialog = await findDialog()

      await user.click(await within(dialog).findByRole('button', { name: 'Annulla la richiesta' }))
      expect(within(dialog).getByText(/^Annullare la richiesta\?/)).toBeInTheDocument()
      expect(cancelled).toBe(0)
      await user.click(within(dialog).getByRole('button', { name: 'Annulla la richiesta' }))

      await waitFor(() => expect(cancelled).toBe(1))
      expect(await screen.findByText('Richiesta annullata')).toBeInTheDocument()
      expect(onClose).toHaveBeenCalled()
    })

    it('hides the direct cancel on the approver own request, which keeps the cancellation request', async () => {
      signIn()
      respondWith(leaveRequest({ id: 5, status: 'approved', user: { id: adminUser.id, name: adminUser.name }, days, can: { ...NO_ACTIONS, cancel: true, request_cancellation: true } }))
      renderDialog()
      const dialog = await findDialog()

      expect(await within(dialog).findByRole('button', { name: 'Chiedi annullamento' })).toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: 'Annulla la richiesta' })).not.toBeInTheDocument()
    })

    it('does not show the direct cancel before the viewer is known', async () => {
      server.use(http.get('/api/auth/user', () => new Promise(() => {})))
      respondWith(leaveRequest({ id: 5, status: 'approved', user: someoneElse, days, can: { ...NO_ACTIONS, cancel: true, request_cancellation: true } }))
      renderDialog()
      const dialog = await findDialog()

      expect(await within(dialog).findByRole('button', { name: 'Chiedi annullamento' })).toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: 'Annulla la richiesta' })).not.toBeInTheDocument()
    })

    it('approves a pending request after confirmation', async () => {
      signIn()
      respondWith(leaveRequest({ id: 5, status: 'pending', user: someoneElse, days, can: { ...NO_ACTIONS, approve: true, reject: true } }))
      let approved = 0
      server.use(http.post('/api/leave-requests/5/approve', () => ((approved += 1), HttpResponse.json({ data: leaveRequest({ id: 5, status: 'approved' }) }))))
      const { user } = renderDialog()
      const dialog = await findDialog()

      await user.click(await within(dialog).findByRole('button', { name: 'Approva' }))
      await user.click(within(dialog).getByRole('button', { name: 'Approva' }))

      await waitFor(() => expect(approved).toBe(1))
      expect(await screen.findByText('Richiesta approvata')).toBeInTheDocument()
    })

    it('rejects a pending request with the reason written in the confirmation', async () => {
      signIn()
      respondWith(leaveRequest({ id: 5, status: 'pending', user: someoneElse, days, can: { ...NO_ACTIONS, approve: true, reject: true } }))
      const bodies: unknown[] = []
      server.use(http.post('/api/leave-requests/5/reject', async ({ request }) => (bodies.push(await request.json()), HttpResponse.json({ data: leaveRequest({ id: 5, status: 'rejected' }) }))))
      const { user } = renderDialog()
      const dialog = await findDialog()

      await user.click(await within(dialog).findByRole('button', { name: 'Rifiuta' }))
      await user.type(within(dialog).getByRole('textbox', { name: 'Motivo (facoltativo)' }), 'Chiusura progetto')
      await user.click(within(dialog).getByRole('button', { name: 'Rifiuta' }))

      await waitFor(() => expect(bodies).toEqual([{ decision_note: 'Chiusura progetto' }]))
      expect(await screen.findByText('Richiesta rifiutata')).toBeInTheDocument()
    })

    it('approves a cancellation request', async () => {
      signIn()
      respondWith(leaveRequest({ id: 5, status: 'cancellation_requested', user: someoneElse, days, can: { ...NO_ACTIONS, approve_cancellation: true, reject_cancellation: true } }))
      let approved = 0
      server.use(http.post('/api/leave-requests/5/cancellation/approve', () => ((approved += 1), HttpResponse.json({ data: leaveRequest({ id: 5, status: 'cancelled' }) }))))
      const { user } = renderDialog()
      const dialog = await findDialog()

      expect(within(dialog).getByRole('button', { name: 'Rifiuta annullamento' })).toBeInTheDocument()
      await user.click(await within(dialog).findByRole('button', { name: 'Approva annullamento' }))
      await user.click(within(dialog).getByRole('button', { name: 'Approva annullamento' }))

      await waitFor(() => expect(approved).toBe(1))
      expect(await screen.findByText('Annullamento approvato')).toBeInTheDocument()
    })
  })
})
