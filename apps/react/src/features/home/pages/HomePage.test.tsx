import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { User } from '@/features/auth/api'
import HomePage from '@/features/home/pages/HomePage'
import { expectNoA11yViolations } from '@/test/axe'
import { absenceTypeOption } from '@/test/absenceTypesFixtures'
import { balanceMovement, balanceSummary, pageResponse } from '@/test/balancesFixtures'
import { adminUser, currentUserResponse } from '@/test/fixtures'
import { leaveRequest } from '@/test/leaveFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'
import type { LeaveRequest } from '@/features/leave/api'

const routes: RouteObject[] = [{ path: '/', element: <HomePage /> }]

const employee: User = { ...adminUser, role: 'employee', role_label: 'Utente' }

/** Data locale a `offset` giorni da oggi (YYYY-MM-DD), come la calcola la Home. */
const day = (offset: number): string => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const upcoming = (id: number, from: number, status: LeaveRequest['status'] = 'approved'): LeaveRequest =>
  leaveRequest({ id, status, starts_on: day(from), ends_on: day(from), absence_type: { id: 1, name: `Tipo ${id}`, balance: 'vacation' } })

const respond = ({ user = adminUser, pending = null as number | null, requests = [] as LeaveRequest[], summary = balanceSummary({ can: { adjust: false, manage_accrual: false } }) } = {}) =>
  server.use(
    http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(user, { pendingApprovals: pending }))),
    http.get('/api/profile/balances', () => HttpResponse.json({ data: summary })),
    http.get('/api/profile/balance-movements', () => HttpResponse.json(pageResponse([balanceMovement()]))),
    http.get('/api/profile/absence-types', () => HttpResponse.json({ data: [absenceTypeOption()] })),
    http.get('/api/profile/calendar', () => HttpResponse.json({ data: { days: [], requests } })),
  )

describe('HomePage', () => {
  it('greets the user and shows balances, movements and usable types', async () => {
    respond({ user: employee })
    renderRoutes(routes)

    expect(await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Ferie' })).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Movimenti' })).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Tipi di assenza che puoi usare' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /richieste? da approvare/ })).not.toBeInTheDocument()
    await expectNoA11yViolations(document.body)
  })

  it('keeps the text and the types for a person without balances', async () => {
    respond({ user: employee, summary: balanceSummary({ applicable: false }) })
    renderRoutes(routes)

    expect(await screen.findByText(/Non hai saldi/)).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Tipi di assenza che puoi usare' })).toBeInTheDocument()
  })

  it('lists at most 5 upcoming active requests, soonest first, with badge and link to /leave', async () => {
    respond({
      requests: [
        upcoming(1, -10),
        upcoming(2, 30, 'pending'),
        upcoming(3, 3),
        upcoming(4, 4, 'rejected'),
        upcoming(5, 5, 'cancellation_requested'),
        upcoming(6, 6),
        upcoming(7, 7),
        upcoming(8, 8),
        upcoming(9, 9),
      ],
    })
    renderRoutes(routes)

    const list = await screen.findByRole('list', { name: 'Prossime assenze' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(5)
    expect(items.map((item) => within(item).getByText(/^Tipo \d$/).textContent)).toEqual(['Tipo 3', 'Tipo 5', 'Tipo 6', 'Tipo 7', 'Tipo 8'])
    expect(within(items[1]).getByText('Annullamento richiesto')).toBeInTheDocument()
    expect(within(items[0]).getByText('Approvata')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vai al calendario' })).toHaveAttribute('href', '/leave')
  })

  it('shows an empty text when there are no upcoming absences', async () => {
    respond()
    renderRoutes(routes)

    expect(await screen.findByText('Nessuna assenza in programma.')).toBeInTheDocument()
  })

  it('shows the approvals card to an approver with pending requests', async () => {
    respond({ pending: 3 })
    renderRoutes(routes)

    const link = await screen.findByRole('link', { name: '3 richieste da approvare' })
    expect(link).toHaveAttribute('href', '/leave?tab=approvals')
    await expectNoA11yViolations(document.body)
  })

  it('uses the singular for one request and hides the card with zero', async () => {
    respond({ pending: 1 })
    const { unmount } = renderRoutes(routes)
    expect(await screen.findByRole('link', { name: '1 richiesta da approvare' })).toBeInTheDocument()
    unmount()

    respond({ pending: 0 })
    renderRoutes(routes)
    await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })
    expect(screen.queryByRole('link', { name: /da approvare/ })).not.toBeInTheDocument()
  })
})
