import { act, screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UsersPage from '@/features/users/pages/UsersPage'
import { expectNoA11yViolations } from '@/test/axe'
import { managedUser, userListResponse } from '@/test/usersFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ path: '/users', element: <UsersPage /> }]

const respondWith = (
  onRequest: (url: URL) => void = () => undefined,
  users = [
    managedUser({
      id: 1,
      name: 'Anna Admin',
      role: 'admin',
      role_label: 'HR / Admin',
      is_current_user: true,
    }),
    managedUser(),
  ],
) =>
  server.use(
    http.get('/api/users', ({ request }) => {
      onRequest(new URL(request.url))
      return HttpResponse.json(userListResponse(users, { all: 3, active: 2, invited: 1, disabled: 0 }))
    }),
  )

describe('UsersPage', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists people with textual role and status badges and marks the current user', async () => {
    respondWith()
    renderRoutes(routes, ['/users'])

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Marco Bianchi')).toBeInTheDocument()
    expect(within(table).getAllByText('Attivo').length).toBeGreaterThan(0)
    expect(within(table).getByText('Tu')).toBeInTheDocument()
  })

  it('shows the counts on the status tabs and filters through the URL', async () => {
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    const { user, router } = renderRoutes(routes, ['/users'])

    await user.click(await screen.findByRole('tab', { name: /Invitati.*1/ }))

    expect(router.state.location.search).toBe('?status=invited')
    await vi.waitFor(() => expect(urls.at(-1)?.searchParams.get('filter[status]')).toBe('invited'))
  })

  it('shows no counts on the tabs until the first load ends', async () => {
    server.use(
      http.get('/api/users', async () => {
        await delay('infinite')
        return HttpResponse.json(userListResponse([]))
      }),
    )
    renderRoutes(routes, ['/users'])

    expect(await screen.findByRole('tab', { name: 'Tutti' })).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('reads filter, search and page from the URL', async () => {
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    renderRoutes(routes, ['/users?status=disabled&q=rossi&page=2'])

    await screen.findByRole('table')
    const last = urls.at(-1)
    expect(last?.searchParams.get('filter[status]')).toBe('disabled')
    expect(last?.searchParams.get('search')).toBe('rossi')
    expect(last?.searchParams.get('page')).toBe('2')
    expect(screen.getByRole('searchbox', { name: 'Cerca per nome o email' })).toHaveValue('rossi')
  })

  it('debounces the search and goes back to page one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    respondWith()
    const { user, router } = renderRoutes(routes, ['/users?page=3'], {
      advanceTimers: vi.advanceTimersByTime,
    })

    await user.type(await screen.findByRole('searchbox', { name: 'Cerca per nome o email' }), 'mar')
    expect(router.state.location.search).toBe('?page=3')
    vi.advanceTimersByTime(300)

    await vi.waitFor(() => expect(router.state.location.search).toBe('?q=mar'))
  })

  it('keeps the search field in sync with the URL when going back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    const { user, router } = renderRoutes(routes, ['/users'], {
      advanceTimers: vi.advanceTimersByTime,
    })
    await router.navigate('/users?status=active')

    const search = await screen.findByRole('searchbox', {
      name: 'Cerca per nome o email',
    })
    await user.type(search, 'mar')
    vi.advanceTimersByTime(300)
    await vi.waitFor(() => expect(router.state.location.search).toBe('?status=active&q=mar'))
    // la vista segue l'URL: attendo che la ricerca sia davvero partita
    await vi.waitFor(() => expect(urls.at(-1)?.searchParams.get('search')).toBe('mar'))

    await act(() => router.navigate(-1))
    await vi.waitFor(() => expect(router.state.location.search).toBe(''))
    await vi.waitFor(() => expect(screen.getByRole('searchbox', { name: 'Cerca per nome o email' })).toHaveValue(''))
    vi.advanceTimersByTime(300)
    expect(router.state.location.search).toBe('')
  })

  it('goes back to the last page when the page is out of range', async () => {
    server.use(
      http.get('/api/users', () =>
        HttpResponse.json({
          data: [],
          links: {},
          meta: {
            current_page: 999,
            last_page: 2,
            per_page: 25,
            total: 30,
            counts: { all: 30, active: 30, invited: 0, disabled: 0 },
          },
        }),
      ),
    )
    const { router } = renderRoutes(routes, ['/users?page=999'])

    await vi.waitFor(() => expect(router.state.location.search).toBe('?page=2'))
  })

  it('shows an empty state with a way to clear the filters', async () => {
    respondWith(() => undefined, [])
    const { user, router } = renderRoutes(routes, ['/users?status=disabled&q=zzz'])

    expect(await screen.findByText('Nessun utente trovato.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Azzera filtri' }))
    expect(router.state.location.search).toBe('')
  })

  it('shows an error with retry', async () => {
    server.use(http.get('/api/users', () => HttpResponse.json({ message: 'boom' }, { status: 500 })))
    renderRoutes(routes, ['/users'])

    expect(await screen.findByText('Non è stato possibile caricare gli utenti.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Riprova' })).toBeInTheDocument()
  })

  it('shows when an invitation expires', async () => {
    respondWith(
      () => undefined,
      [
        managedUser({
          status: 'invited',
          status_label: 'Invitato',
          invitation_expires_at: '2099-10-16T10:00:00+00:00',
        }),
      ],
    )
    renderRoutes(routes, ['/users'])

    const table = await screen.findByRole('table')
    expect(within(table).getByText(/Invito scade il/)).toBeInTheDocument()
  })

  it('shows an invitation without expiry (removed by the cleanup) as expired, in the table and in the cards', async () => {
    respondWith(() => undefined, [managedUser({ status: 'invited', status_label: 'Invitato', invitation_expires_at: null })])
    renderRoutes(routes, ['/users'])

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Invito scaduto')).toBeInTheDocument()
    const card = screen.getAllByRole('listitem').find((item) => item.textContent?.includes('Marco Bianchi'))
    expect(card).toHaveTextContent('Invito scaduto')
  })

  it('has no accessibility violations', async () => {
    respondWith()
    const { container } = renderRoutes(routes, ['/users'])

    await screen.findByRole('table')
    await expectNoA11yViolations(container)
  })
})
