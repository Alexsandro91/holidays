import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEAVE_REQUEST_STATUSES, type LeaveRequest } from '@/features/leave/api'
import MyLeaveRequestsList from '@/features/leave/components/MyLeaveRequestsList'
import { expectNoA11yViolations } from '@/test/axe'
import { leaveRequest } from '@/test/leaveFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const page = (data: LeaveRequest[], current: number, last: number) => ({ data, links: {}, meta: { current_page: current, last_page: last, per_page: 20, total: data.length } })

const firstPage = LEAVE_REQUEST_STATUSES.map((status, index) =>
  leaveRequest({ id: index + 1, status, starts_on: `2026-11-0${index + 1}`, ends_on: `2026-11-0${index + 1}`, minutes: 480, working_days: 1 }),
)

let queries: string[] = []

const renderList = () => {
  const onOpen = vi.fn()
  const view = renderRoutes([{ path: '/', element: <MyLeaveRequestsList onOpen={onOpen} /> }])
  return { ...view, onOpen }
}

describe('MyLeaveRequestsList', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 20, 10, 0))
    queries = []
    server.use(
      http.get('/api/leave-requests', ({ request }) => {
        const url = new URL(request.url)
        queries.push(url.search)
        if (url.searchParams.get('year') === '2025') return HttpResponse.json(page([], 1, 1))
        if (url.searchParams.get('page') === '2') return HttpResponse.json(page([leaveRequest({ id: 20, absence_type: { id: 2, name: 'ROL', balance: 'rol' } })], 2, 2))
        return HttpResponse.json(page(firstPage, 1, 2))
      }),
    )
  })
  afterEach(() => vi.useRealTimers())

  it('lists the requests of the year in every status and loads more', async () => {
    const { user } = renderList()

    const list = await screen.findByRole('list', { name: 'Le mie richieste' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items.map((item) => within(item).getByText(/^(In attesa|Approvata|Non approvata|Ritirata|Annullamento richiesto|Annullata)$/).textContent)).toEqual([
      'In attesa',
      'Approvata',
      'Non approvata',
      'Ritirata',
      'Annullamento richiesto',
      'Annullata',
    ])
    expect(within(items[0]).getByRole('button', { name: /^Ferie, 1 novembre 2026/ })).toBeInTheDocument()
    expect(within(items[0]).getByText('8 h · 1 giorno')).toBeInTheDocument()
    await expectNoA11yViolations(document.body)

    await user.click(screen.getByRole('button', { name: 'Carica altre' }))
    expect(await within(list).findByText('ROL')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carica altre' })).not.toBeInTheDocument()
    expect(queries).toEqual(['?year=2026&page=1', '?year=2026&page=2'])
  })

  it('changes the year', async () => {
    const { user } = renderList()
    await screen.findByRole('list', { name: 'Le mie richieste' })

    await user.click(screen.getByRole('combobox', { name: 'Anno' }))
    await user.click(await screen.findByRole('option', { name: '2025' }))

    expect(await screen.findByText('Nessuna richiesta in questo anno.')).toBeInTheDocument()
    await waitFor(() => expect(queries).toContain('?year=2025&page=1'))
  })

  it('opens the detail of a request', async () => {
    const { user, onOpen } = renderList()

    await user.click(await screen.findByRole('button', { name: /^Ferie, 2 novembre 2026/ }))
    expect(onOpen).toHaveBeenCalledWith(2, 'list-2')
  })
})
