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
      email: 'anna@holidays.test',
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

/** Lista su più pagine: la pagina richiesta torna nella risposta, come fa Laravel. */
const respondWithPages = (onRequest: (url: URL) => void = () => undefined, { total = 60, lastPage = 3 } = {}) =>
  server.use(
    http.get('/api/users', ({ request }) => {
      const url = new URL(request.url)
      onRequest(url)
      const page = Number(url.searchParams.get('page') ?? '1')
      const perPage = Number(url.searchParams.get('per_page') ?? '25')
      return HttpResponse.json({
        data: [managedUser({ id: 100 + page, name: `Persona ${page}` })],
        links: {},
        meta: { current_page: page, last_page: lastPage, per_page: perPage, total, counts: { all: total, active: total, invited: 0, disabled: 0 } },
      })
    }),
  )

const columnHeader = (name: string): HTMLElement => {
  const header = within(screen.getByRole('table'))
    .getAllByRole('columnheader')
    .find((cell) => cell.textContent?.includes(name))
  if (!header) throw new Error(`Intestazione ${name} mancante`)
  return header
}

describe('UsersPage', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists people with textual role and status badges and marks the current user', async () => {
    respondWith()
    renderRoutes(routes, ['/users'])

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Marco Bianchi')).toBeInTheDocument()
    expect(within(table).getByText('marco@holidays.test')).toBeInTheDocument()
    expect(within(table).getAllByText('Attivo').length).toBeGreaterThan(0)
    expect(within(table).getByText('Tu')).toBeInTheDocument()
  })

  it('sends the default sort and page size to the API', async () => {
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    renderRoutes(routes, ['/users'])

    await screen.findByRole('table')
    const last = urls.at(-1)
    expect(last?.searchParams.get('sort')).toBe('name')
    expect(last?.searchParams.get('per_page')).toBe('25')
    expect(last?.searchParams.has('page')).toBe(false)
    expect(last?.searchParams.has('search')).toBe(false)
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

  it('reads filters, sort and page from the URL and maps them on the API filters', async () => {
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    renderRoutes(routes, ['/users?name=ros&email=%40acme&role=manager&status=disabled&sort=-email&page=2&per_page=10'])

    await screen.findByRole('table')
    const last = urls.at(-1)
    expect(last?.searchParams.get('filter[name]')).toBe('ros')
    expect(last?.searchParams.get('filter[email]')).toBe('@acme')
    expect(last?.searchParams.get('filter[role]')).toBe('manager')
    expect(last?.searchParams.get('filter[status]')).toBe('disabled')
    expect(last?.searchParams.get('sort')).toBe('-email')
    expect(last?.searchParams.get('page')).toBe('2')
    expect(last?.searchParams.get('per_page')).toBe('10')
    expect(screen.getByRole('searchbox', { name: 'Nome' })).toHaveValue('ros')
    expect(screen.getByRole('searchbox', { name: 'Email' })).toHaveValue('@acme')
    expect(screen.getByRole('combobox', { name: 'Ruolo' })).toHaveTextContent('Responsabile')
  })

  it('ignores unknown values in the URL', async () => {
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    renderRoutes(routes, ['/users?role=boss&status=x&sort=age&per_page=1000'])

    await screen.findByRole('table')
    const last = urls.at(-1)
    expect(last?.searchParams.has('filter[role]')).toBe(false)
    expect(last?.searchParams.has('filter[status]')).toBe(false)
    expect(last?.searchParams.get('sort')).toBe('name')
    expect(last?.searchParams.get('per_page')).toBe('25')
  })

  it('debounces the name filter, replaces the history entry and goes back to page one', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    const { user, router } = renderRoutes(routes, ['/users?page=3'], {
      advanceTimers: vi.advanceTimersByTime,
    })

    await user.type(await screen.findByRole('searchbox', { name: 'Nome' }), 'mar')
    expect(router.state.location.search).toBe('?page=3')
    vi.advanceTimersByTime(300)

    await vi.waitFor(() => expect(router.state.location.search).toBe('?name=mar'))
    expect(router.state.historyAction).toBe('REPLACE')
    await vi.waitFor(() => expect(urls.at(-1)?.searchParams.get('filter[name]')).toBe('mar'))
  })

  it('debounces the email filter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    const { user, router } = renderRoutes(routes, ['/users'], {
      advanceTimers: vi.advanceTimersByTime,
    })

    await user.type(await screen.findByRole('searchbox', { name: 'Email' }), 'acme')
    vi.advanceTimersByTime(300)

    await vi.waitFor(() => expect(router.state.location.search).toBe('?email=acme'))
    await vi.waitFor(() => expect(urls.at(-1)?.searchParams.get('filter[email]')).toBe('acme'))
  })

  it('filters by role with the select', async () => {
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    const { user, router } = renderRoutes(routes, ['/users?page=2'])

    await user.click(await screen.findByRole('combobox', { name: 'Ruolo' }))
    await user.click(await screen.findByRole('option', { name: 'Responsabile' }))

    expect(router.state.location.search).toBe('?role=manager')
    await vi.waitFor(() => expect(urls.at(-1)?.searchParams.get('filter[role]')).toBe('manager'))
  })

  it('clears every filter but keeps the sort', async () => {
    respondWith()
    const { user, router } = renderRoutes(routes, ['/users?name=ma&email=acme&role=manager&status=active&sort=-email&page=2'])

    await user.click(await screen.findByRole('button', { name: 'Azzera filtri' }))

    expect(router.state.location.search).toBe('?sort=-email')
    expect(screen.getByRole('searchbox', { name: 'Nome' })).toHaveValue('')
    expect(screen.getByRole('searchbox', { name: 'Email' })).toHaveValue('')
  })

  it('offers "Azzera filtri" only when a filter is active', async () => {
    respondWith()
    renderRoutes(routes, ['/users?sort=-email'])

    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'Azzera filtri' })).not.toBeInTheDocument()
  })

  it('sorts by name by default and marks the sorted header with aria-sort', async () => {
    respondWith()
    renderRoutes(routes, ['/users'])

    await screen.findByRole('table')
    expect(columnHeader('Nome')).toHaveAttribute('aria-sort', 'ascending')
    expect(columnHeader('Email')).not.toHaveAttribute('aria-sort')
    expect(within(columnHeader('Ruolo')).getByRole('button', { name: 'Ruolo' })).toBeInTheDocument()
    expect(within(columnHeader('Dettagli')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('sorts with the header buttons: ascending first, then descending, back to page one', async () => {
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    const { user, router } = renderRoutes(routes, ['/users?page=2'])

    await screen.findByRole('table')
    await user.click(within(columnHeader('Email')).getByRole('button', { name: 'Email' }))
    expect(router.state.location.search).toBe('?sort=email')
    await vi.waitFor(() => expect(columnHeader('Email')).toHaveAttribute('aria-sort', 'ascending'))
    expect(columnHeader('Nome')).not.toHaveAttribute('aria-sort')

    await user.click(within(columnHeader('Email')).getByRole('button', { name: 'Email' }))
    expect(router.state.location.search).toBe('?sort=-email')
    await vi.waitFor(() => expect(columnHeader('Email')).toHaveAttribute('aria-sort', 'descending'))
    await vi.waitFor(() => expect(urls.at(-1)?.searchParams.get('sort')).toBe('-email'))
  })

  it('sorts with the "Ordina per" select of the mobile view', async () => {
    respondWith()
    const { user, router } = renderRoutes(routes, ['/users'])

    await user.click(await screen.findByRole('combobox', { name: 'Ordina per' }))
    await user.click(await screen.findByRole('option', { name: 'Email (Z → A)' }))

    expect(router.state.location.search).toBe('?sort=-email')
  })

  it('paginates with first, previous, next and last, with the page status and the total', async () => {
    const urls: URL[] = []
    respondWithPages((url) => urls.push(url))
    const { user, router } = renderRoutes(routes, ['/users?page=2'])

    const navigation = await screen.findByRole('navigation', { name: 'Pagine' })
    expect(await within(navigation).findByText('Pagina 2 di 3')).toBeInTheDocument()
    expect(screen.getByText('60 utenti')).toBeInTheDocument()

    await user.click(within(navigation).getByRole('button', { name: 'Ultima pagina' }))
    expect(router.state.location.search).toBe('?page=3')
    await vi.waitFor(() => expect(urls.at(-1)?.searchParams.get('page')).toBe('3'))
    await within(navigation).findByText('Pagina 3 di 3')
    expect(within(navigation).getByRole('button', { name: 'Pagina successiva' })).toBeDisabled()
    expect(within(navigation).getByRole('button', { name: 'Ultima pagina' })).toBeDisabled()

    await user.click(within(navigation).getByRole('button', { name: 'Pagina precedente' }))
    expect(router.state.location.search).toBe('?page=2')
    await within(navigation).findByText('Pagina 2 di 3')

    await user.click(within(navigation).getByRole('button', { name: 'Prima pagina' }))
    expect(router.state.location.search).toBe('')
    await within(navigation).findByText('Pagina 1 di 3')
    expect(within(navigation).getByRole('button', { name: 'Pagina precedente' })).toBeDisabled()

    await user.click(within(navigation).getByRole('button', { name: 'Pagina successiva' }))
    expect(router.state.location.search).toBe('?page=2')
  })

  it('changes the rows per page and goes back to page one', async () => {
    const urls: URL[] = []
    respondWithPages((url) => urls.push(url))
    const { user, router } = renderRoutes(routes, ['/users?page=2'])

    await user.click(await screen.findByRole('combobox', { name: 'Righe per pagina' }))
    await user.click(await screen.findByRole('option', { name: '10' }))

    expect(router.state.location.search).toBe('?per_page=10')
    await vi.waitFor(() => expect(urls.at(-1)?.searchParams.get('per_page')).toBe('10'))
  })

  it('keeps the filter fields in sync with the URL when going back and forward', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const urls: URL[] = []
    respondWith((url) => urls.push(url))
    const { user, router } = renderRoutes(routes, ['/users'], {
      advanceTimers: vi.advanceTimersByTime,
    })
    await router.navigate('/users?status=active')

    await user.type(await screen.findByRole('searchbox', { name: 'Nome' }), 'mar')
    vi.advanceTimersByTime(300)
    await vi.waitFor(() => expect(router.state.location.search).toBe('?name=mar&status=active'))
    // la vista segue l'URL: attendo che la ricerca sia davvero partita
    await vi.waitFor(() => expect(urls.at(-1)?.searchParams.get('filter[name]')).toBe('mar'))

    await act(() => router.navigate(-1))
    await vi.waitFor(() => expect(router.state.location.search).toBe(''))
    await vi.waitFor(() => expect(screen.getByRole('searchbox', { name: 'Nome' })).toHaveValue(''))
    vi.advanceTimersByTime(300)
    expect(router.state.location.search).toBe('')

    await act(() => router.navigate(1))
    await vi.waitFor(() => expect(screen.getByRole('searchbox', { name: 'Nome' })).toHaveValue('mar'))
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
    const { router } = renderRoutes(routes, ['/users?page=999&sort=-role'])

    await vi.waitFor(() => expect(router.state.location.search).toBe('?sort=-role&page=2'))
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('shows an empty state with a way to clear the filters', async () => {
    respondWith(() => undefined, [])
    const { user, router } = renderRoutes(routes, ['/users?status=disabled&name=zzz'])

    expect(await screen.findByText('Nessun utente trovato.')).toBeInTheDocument()
    const clear = screen.getAllByRole('button', { name: 'Azzera filtri' })
    await user.click(clear[clear.length - 1])
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
    respondWithPages()
    const { container } = renderRoutes(routes, ['/users?name=per&page=2'])

    await screen.findByRole('table')
    await screen.findByText('Pagina 2 di 3')
    await expectNoA11yViolations(container)
  })
})
