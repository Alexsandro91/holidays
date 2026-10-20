import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import type { User } from '@/features/auth/api'
import type { LeaveRequest } from '@/features/leave/api'
import ApprovalsList from '@/features/leave/components/ApprovalsList'
import { expectNoA11yViolations } from '@/test/axe'
import { adminUser, currentUserResponse } from '@/test/fixtures'
import { leaveRequest } from '@/test/leaveFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const manager: User = { ...adminUser, role: 'manager', role_label: 'Responsabile' }

const CAN_DECIDE: LeaveRequest['can'] = { withdraw: false, request_cancellation: false, approve: true, reject: true, approve_cancellation: false, reject_cancellation: false, cancel: false }
const CAN_DECIDE_CANCELLATION: LeaveRequest['can'] = { ...CAN_DECIDE, approve: false, reject: false, approve_cancellation: true, reject_cancellation: true }

const pendingRequest = leaveRequest({
  id: 11,
  status: 'pending',
  note: 'Viaggio di famiglia',
  can: CAN_DECIDE,
  warnings: [
    { code: 'balance_insufficient', params: { after_minutes: -480 } },
    { code: 'limit_exceeded', params: { limit: 5, unit: 'days', period: 'year', total: 6 } },
  ],
})
const cancellationRequest = leaveRequest({
  id: 12,
  user: { id: 3, name: 'Luca Bianchi' },
  status: 'cancellation_requested',
  starts_on: '2026-11-03',
  ends_on: '2026-11-03',
  minutes: 480,
  working_days: 1,
  can: CAN_DECIDE_CANCELLATION,
})

interface Setup {
  user?: User
  multiple?: boolean
  requests?: LeaveRequest[]
}

const respond = ({ user = manager, multiple = false, requests = [pendingRequest, cancellationRequest] }: Setup = {}) => {
  const state = { reads: 0, locations: [] as (string | null)[] }
  server.use(
    http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(user, { multipleLocations: multiple, pendingApprovals: requests.length }))),
    http.get('/api/approvals', ({ request }) => {
      state.reads += 1
      state.locations.push(new URL(request.url).searchParams.get('filter[location]'))
      return HttpResponse.json({ data: requests, meta: { count: requests.length } })
    }),
    http.get('/api/locations/options', () =>
      HttpResponse.json({ data: [{ id: 1, name: 'Sede principale', is_primary: true }, { id: 2, name: 'Sede di Roma', is_primary: false }] }),
    ),
  )
  return state
}

/** Le righe dell'elenco, senza gli elementi degli avvisi che stanno dentro */
const rowsOf = (list: HTMLElement): HTMLElement[] => within(list).getAllByRole('listitem').filter((item) => item.parentElement === list)

const renderList = () => {
  const onOpen = vi.fn()
  const view = renderRoutes([{ path: '/', element: <ApprovalsList onOpen={onOpen} /> }])
  return { ...view, onOpen }
}

describe('ApprovalsList', () => {
  it('shows person, type, dates, hours, note and warnings with the balance one highlighted', async () => {
    respond()
    renderList()

    const list = await screen.findByRole('list', { name: 'Da approvare' })
    const [first, second] = rowsOf(list)
    expect(within(first).getByText('Sara Colombo')).toBeInTheDocument()
    expect(within(first).getByText('Ferie')).toBeInTheDocument()
    expect(within(first).getByText('26–30 ottobre 2026')).toBeInTheDocument()
    expect(within(first).getByText('40 h · 5 giorni')).toBeInTheDocument()
    expect(within(first).getByText('Viaggio di famiglia')).toBeInTheDocument()
    const balance = within(first).getByText('Saldo insufficiente: dopo la richiesta resterebbero −8 h.')
    expect(balance).toHaveClass('font-medium')
    expect(within(first).getByText(/^Limite del tipo superato/)).not.toHaveClass('font-medium')
    expect(within(second).getByText('Luca Bianchi')).toBeInTheDocument()
    expect(within(second).getByText('Chiede l’annullamento')).toBeInTheDocument()
    await expectNoA11yViolations(document.body)
  })

  it('offers approve and reject for a request and the cancellation pair for a cancellation', async () => {
    respond()
    renderList()

    const [first, second] = rowsOf(await screen.findByRole('list', { name: 'Da approvare' }))
    expect(within(first).getByRole('button', { name: /^Approva, Sara Colombo/ })).toBeInTheDocument()
    expect(within(first).getByRole('button', { name: /^Rifiuta, Sara Colombo/ })).toBeInTheDocument()
    expect(within(first).queryByRole('button', { name: /annullamento/ })).not.toBeInTheDocument()
    expect(within(second).getByRole('button', { name: /^Approva annullamento, Luca Bianchi/ })).toBeInTheDocument()
    expect(within(second).getByRole('button', { name: /^Rifiuta annullamento, Luca Bianchi/ })).toBeInTheDocument()
    expect(within(second).queryByRole('button', { name: /^Approva, / })).not.toBeInTheDocument()
  })

  it('approves from the row and refetches', async () => {
    const state = respond()
    let approved = 0
    server.use(http.post('/api/leave-requests/11/approve', () => ((approved += 1), HttpResponse.json({ data: leaveRequest({ id: 11, status: 'approved' }) }))))
    const { user } = renderList()

    await user.click(await screen.findByRole('button', { name: /^Approva, Sara Colombo/ }))

    await waitFor(() => expect(approved).toBe(1))
    expect(await screen.findByText('Richiesta di Sara Colombo approvata')).toBeInTheDocument()
    await waitFor(() => expect(state.reads).toBeGreaterThan(1))
  })

  it('approves and rejects a cancellation from the row', async () => {
    respond()
    const calls: string[] = []
    server.use(
      http.post('/api/leave-requests/12/cancellation/approve', () => (calls.push('approve'), HttpResponse.json({ data: leaveRequest({ id: 12, status: 'cancelled' }) }))),
      http.post('/api/leave-requests/12/cancellation/reject', () => (calls.push('reject'), HttpResponse.json({ data: leaveRequest({ id: 12, status: 'approved' }) }))),
    )
    const { user } = renderList()

    await user.click(await screen.findByRole('button', { name: /^Approva annullamento, Luca Bianchi/ }))
    await waitFor(() => expect(calls).toEqual(['approve']))
    await user.click(await screen.findByRole('button', { name: /^Rifiuta annullamento, Luca Bianchi/ }))
    await waitFor(() => expect(calls).toEqual(['approve', 'reject']))
  })

  it('rejects with an optional reason', async () => {
    respond()
    const bodies: unknown[] = []
    server.use(http.post('/api/leave-requests/11/reject', async ({ request }) => (bodies.push(await request.json()), HttpResponse.json({ data: leaveRequest({ id: 11, status: 'rejected' }) }))))
    const { user } = renderList()

    await user.click(await screen.findByRole('button', { name: /^Rifiuta, Sara Colombo/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Rifiuta la richiesta' })
    await user.type(within(dialog).getByRole('textbox', { name: 'Motivo (facoltativo)' }), 'Settimana di chiusura')
    await user.click(within(dialog).getByRole('button', { name: 'Rifiuta' }))

    await waitFor(() => expect(bodies).toEqual([{ decision_note: 'Settimana di chiusura' }]))
    expect(await screen.findByText('Richiesta di Sara Colombo rifiutata')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows a message and refetches on a 409 state change', async () => {
    const state = respond()
    server.use(http.post('/api/leave-requests/11/approve', () => HttpResponse.json({ message: 'Già decisa', code: 'leave.state_changed' }, { status: 409 })))
    const { user } = renderList()

    await user.click(await screen.findByRole('button', { name: /^Approva, Sara Colombo/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La richiesta è già cambiata: l’elenco è stato aggiornato.')
    await waitFor(() => expect(state.reads).toBeGreaterThan(1))
  })

  it('opens the detail from the row with an approval trigger', async () => {
    respond()
    const { user, onOpen } = renderList()

    await user.click(await screen.findByRole('button', { name: 'Apri il dettaglio di Sara Colombo' }))

    expect(onOpen).toHaveBeenCalledWith(11, 'approval-11')
  })

  it('shows the empty state', async () => {
    respond({ requests: [] })
    renderList()

    expect(await screen.findByText('Nessuna richiesta da approvare.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Da approvare' })).not.toBeInTheDocument()
  })

  it('has the location filter only for an admin with several locations and sends it', async () => {
    const state = respond({ user: adminUser, multiple: true })
    const { user, unmount } = renderList()

    await user.click(await screen.findByRole('combobox', { name: 'Sede' }))
    await user.click(await screen.findByRole('option', { name: 'Sede di Roma' }))
    await waitFor(() => expect(state.locations.at(-1)).toBe('2'))
    unmount()

    respond({ user: manager, multiple: true })
    renderList()
    await screen.findByRole('list', { name: 'Da approvare' })
    expect(screen.queryByRole('combobox', { name: 'Sede' })).not.toBeInTheDocument()
  })

  it('has no location filter for an admin with one location', async () => {
    respond({ user: adminUser, multiple: false })
    renderList()

    await screen.findByRole('list', { name: 'Da approvare' })
    expect(screen.queryByRole('combobox', { name: 'Sede' })).not.toBeInTheDocument()
  })
})
