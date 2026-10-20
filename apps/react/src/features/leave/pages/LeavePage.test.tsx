import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/features/auth/api'
import type { LeaveRequest } from '@/features/leave/api'
import LeavePage from '@/features/leave/pages/LeavePage'
import { absenceTypeOption } from '@/test/absenceTypesFixtures'
import { expectNoA11yViolations } from '@/test/axe'
import { adminUser, currentUserResponse } from '@/test/fixtures'
import { leavePreview, leaveRequest } from '@/test/leaveFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ path: '/leave', element: <LeavePage /> }]

const employee: User = { ...adminUser, role: 'employee', role_label: 'Utente' }

const page = (data: LeaveRequest[]) => ({ data, links: {}, meta: { current_page: 1, last_page: 1, per_page: 20, total: data.length } })

/** Risposte della pagina; `requests` sono quelle del calendario e dell'elenco, modificabili durante il test. */
const respond = ({ user = employee, pending = null }: { user?: User; pending?: number | null } = {}) => {
  const state = { requests: [leaveRequest({ id: 1, status: 'approved', starts_on: '2026-10-29', ends_on: '2026-10-29' })], calendarReads: 0 }
  server.use(
    http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(user, { pendingApprovals: pending }))),
    http.get('/api/profile/calendar', () => {
      state.calendarReads += 1
      return HttpResponse.json({ data: { days: [], requests: state.requests } })
    }),
    http.get('/api/leave-requests', () => HttpResponse.json(page(state.requests))),
    http.get('/api/leave-requests/1', () => HttpResponse.json({ data: { ...state.requests[0], days: [] } })),
    http.get('/api/profile/absence-types', () => HttpResponse.json({ data: [absenceTypeOption()] })),
    http.post('/api/leave-requests/preview', () => HttpResponse.json({ data: leavePreview() })),
  )
  return state
}

describe('LeavePage', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('shows the calendar and my requests without tabs to who does not approve', async () => {
    respond()
    renderRoutes(routes, ['/leave?tab=approvals'])

    expect(await screen.findByRole('heading', { level: 1, name: 'Ferie e permessi' })).toBeInTheDocument()
    expect(await screen.findByRole('grid', { name: 'ottobre 2026' })).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Le mie richieste' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Da approvare/ })).not.toBeInTheDocument()
    await expectNoA11yViolations(document.body)
  })

  it('shows the To approve tab when the count is not null, even at 0, and keeps the tab in the URL', async () => {
    respond({ user: { ...adminUser, role: 'manager', role_label: 'Responsabile' }, pending: 0 })
    const { user, router } = renderRoutes(routes, ['/leave'])

    const calendarTab = await screen.findByRole('tab', { name: 'Il mio calendario' })
    expect(calendarTab).toHaveAttribute('aria-selected', 'true')
    const approvalsTab = screen.getByRole('tab', { name: /^Da approvare/ })
    await user.click(approvalsTab)

    expect(approvalsTab).toHaveAttribute('aria-selected', 'true')
    expect(router.state.location.search).toBe('?tab=approvals')
    expect(screen.queryByRole('grid')).not.toBeInTheDocument()
    await user.click(calendarTab)
    expect(router.state.location.search).toBe('')
  })

  it('opens the To approve tab from the URL with the count', async () => {
    respond({ pending: 3 })
    renderRoutes(routes, ['/leave?tab=approvals'])

    expect(await screen.findByRole('tab', { name: 'Da approvare 3' })).toHaveAttribute('aria-selected', 'true')
    await expectNoA11yViolations(document.body)
  })

  it('returns the focus to the New request button after closing the dialog', async () => {
    respond()
    const { user } = renderRoutes(routes, ['/leave'])
    const button = await screen.findByRole('button', { name: 'Nuova richiesta' })

    await user.click(button)
    expect(await screen.findByRole('dialog', { name: 'Nuova richiesta' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(button).toHaveFocus()
  })

  it('returns the focus to the request in the list after closing the detail', async () => {
    respond()
    const { user } = renderRoutes(routes, ['/leave'])
    const list = await screen.findByRole('list', { name: 'Le mie richieste' })
    const item = await within(list).findByRole('button', { name: /^Ferie, 29 ottobre 2026/ })

    await user.click(item)
    expect(await screen.findByRole('dialog', { name: 'Ferie' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(item).toHaveFocus()
  })

  it('requests the days picked on the calendar, then shows a toast and the updated calendar', async () => {
    const state = respond()
    server.use(
      http.post('/api/leave-requests', () => {
        const created = leaveRequest({ id: 9, status: 'pending', starts_on: '2026-10-26', ends_on: '2026-10-27' })
        state.requests = [...state.requests, created]
        return HttpResponse.json({ data: created }, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/leave'])
    await screen.findByRole('grid', { name: 'ottobre 2026' })

    await user.click(screen.getByRole('gridcell', { name: /^lunedì 26 ottobre 2026/ }))
    await user.click(screen.getByRole('gridcell', { name: /^martedì 27 ottobre 2026/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Nuova richiesta' })
    expect(within(dialog).getByLabelText('Dal')).toHaveValue('2026-10-26')
    expect(within(dialog).getByLabelText('Al')).toHaveValue('2026-10-27')
    await user.click(within(dialog).getByRole('combobox', { name: 'Tipo di assenza' }))
    await user.click(await screen.findByRole('option', { name: 'Ferie' }))
    await within(dialog).findByText('16 h')
    const readsBefore = state.calendarReads
    await user.click(within(dialog).getByRole('button', { name: 'Invia richiesta' }))

    expect(await screen.findByText('Richiesta inviata: Ferie, 26–27 ottobre 2026')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('gridcell', { name: /^lunedì 26 ottobre 2026/ })).toHaveAccessibleName('lunedì 26 ottobre 2026, Ferie: In attesa'))
    expect(state.calendarReads).toBeGreaterThan(readsBefore)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('gridcell', { name: /^martedì 27 ottobre 2026/ })).toHaveFocus()
  })
})
