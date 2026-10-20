import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import BalancesPage from '@/features/balances/pages/BalancesPage'
import { expectNoA11yViolations } from '@/test/axe'
import { balanceOverviewRow, balanceSummary, inheritingAccrual, accrual, pageResponse } from '@/test/balancesFixtures'
import { adminUser, currentUserResponse } from '@/test/fixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ path: '/balances', element: <BalancesPage /> }]

const managerUser = { ...adminUser, id: 5, role: 'manager' as const, role_label: 'Responsabile', location: { id: 2, name: 'Milano' } }

const rows = [
  balanceOverviewRow(),
  balanceOverviewRow({
    user: { id: 3, name: 'Paolo Ferri', role: 'employee', role_label: 'Utente', location: { id: 1, name: 'Sede principale' } },
    weekly_minutes: 1200,
    balances: {
      vacation: { current_minutes: -480, annual_minutes: 4800 },
      rol: { current_minutes: 600, annual_minutes: 2160 },
      ex_holidays: { current_minutes: 120, annual_minutes: 960 },
    },
    last_aligned_on: '2026-09-30',
    can: { adjust: false },
  }),
]

const respond = (onRequest: (url: URL) => void = () => undefined, data = rows, lastPage = 1) =>
  server.use(
    http.get('/api/balances', ({ request }) => {
      const url = new URL(request.url)
      onRequest(url)
      return HttpResponse.json({ ...pageResponse(data, Number(url.searchParams.get('page') ?? '1'), lastPage) })
    }),
  )

const asUser = (user = adminUser, multipleLocations = false) =>
  server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(user, { multipleLocations }))))

const rowOf = async (name: string): Promise<HTMLElement> => {
  const table = await screen.findByRole('table')
  const row = within(table)
    .getAllByRole('row')
    .find((item) => item.textContent?.includes(name))
  if (!row) throw new Error(`Riga ${name} mancante`)
  return row
}

describe('BalancesPage', () => {
  it('shows name, role, weekly hours, part-time and the three balances with their bars', async () => {
    respond()
    asUser()
    renderRoutes(routes, ['/balances'])

    const sara = await rowOf('Sara Colombo')
    expect(within(sara).getByText(/Utente · 40 h a settimana/)).toBeInTheDocument()
    expect(within(sara).queryByText('part-time')).not.toBeInTheDocument()
    expect(within(sara).getByText('87,5 h')).toBeInTheDocument()
    expect(within(sara).getByText('≈ 10,9 gg')).toBeInTheDocument()
    expect(within(sara).getByRole('progressbar', { name: 'Ferie: 87,5 h su 160 h' })).toBeInTheDocument()
    // ROL ed ex festività con annuo 0: niente barra
    expect(within(sara).queryByRole('progressbar', { name: /ROL/ })).not.toBeInTheDocument()

    const paolo = await rowOf('Paolo Ferri')
    expect(within(paolo).getByText('part-time')).toBeInTheDocument()
    expect(within(paolo).getByText('−8 h')).toBeInTheDocument()
    expect(within(paolo).getByText('10 h')).toBeInTheDocument()
    expect(within(paolo).getByText('2 h')).toBeInTheDocument()
    expect(within(paolo).getByRole('progressbar', { name: 'Ferie: −8 h su 80 h' })).toHaveAttribute('data-variant', 'error')
    expect(within(paolo).getByRole('progressbar', { name: 'ROL: 10 h su 36 h' })).toBeInTheDocument()
  })

  it('shows the last alignment date or a highlighted "mai"', async () => {
    respond()
    asUser()
    renderRoutes(routes, ['/balances'])

    expect(within(await rowOf('Sara Colombo')).getByText('mai')).toBeInTheDocument()
    expect(within(await rowOf('Paolo Ferri')).getByText('30/09/2026')).toBeInTheDocument()
  })

  it('sends the default sort and reads filters from the URL', async () => {
    const urls: URL[] = []
    respond((url) => urls.push(url))
    asUser()
    renderRoutes(routes, ['/balances?search=rossi&negative=1&page=2'])

    await screen.findByRole('table')
    const last = urls.at(-1)
    expect(last?.searchParams.get('sort')).toBe('name')
    expect(last?.searchParams.get('filter[search]')).toBe('rossi')
    expect(last?.searchParams.get('filter[negative]')).toBe('1')
    expect(last?.searchParams.get('page')).toBe('2')
    expect(screen.getByRole('checkbox', { name: 'Solo saldi negativi' })).toBeChecked()
  })

  it('writes the negative filter and the sort in the URL', async () => {
    respond()
    asUser()
    const { user, router } = renderRoutes(routes, ['/balances'])

    await user.click(await screen.findByRole('checkbox', { name: 'Solo saldi negativi' }))
    expect(router.state.location.search).toBe('?negative=1')

    await user.click(within(screen.getByRole('table')).getByRole('button', { name: /Persona/ }))
    expect(router.state.location.search).toBe('?negative=1&sort=-name')
  })

  it('shows the location filter and column only to an admin with several locations', async () => {
    server.use(http.get('/api/locations/options', () => HttpResponse.json({ data: [{ id: 1, name: 'Sede principale', is_primary: true }, { id: 2, name: 'Bergamo', is_primary: false }] })))
    respond()
    asUser(adminUser, true)
    renderRoutes(routes, ['/balances'])

    expect(await screen.findByRole('combobox', { name: 'Sede' })).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByRole('columnheader', { name: /Sede/ })).toBeInTheDocument()
  })

  it('hides the location filter with a single location and for managers, and ignores location in the URL', async () => {
    const urls: URL[] = []
    respond((url) => urls.push(url))
    asUser(managerUser, true)
    renderRoutes(routes, ['/balances?location=2&sort=location'])

    await screen.findByRole('table')
    expect(screen.queryByRole('combobox', { name: 'Sede' })).not.toBeInTheDocument()
    expect(urls.at(-1)?.searchParams.has('filter[location]')).toBe(false)
    expect(urls.at(-1)?.searchParams.get('sort')).toBe('name')
  })

  it('shows the location in the title of a manager when there are several locations', async () => {
    respond()
    asUser(managerUser, true)
    renderRoutes(routes, ['/balances'])

    expect(await screen.findByRole('heading', { level: 1, name: 'Saldi · Milano' })).toBeInTheDocument()
  })

  it('opens the balances dialog from the name', async () => {
    respond()
    asUser()
    server.use(
      http.get('/api/users/2/balances', () => HttpResponse.json({ data: balanceSummary() })),
      http.get('/api/users/2/balance-movements', () => HttpResponse.json(pageResponse([]))),
      http.get('/api/users/2/accrual', () => HttpResponse.json({ data: inheritingAccrual() })),
      http.get('/api/locations/1/accrual', () => HttpResponse.json({ data: accrual() })),
    )
    const { user } = renderRoutes(routes, ['/balances'])

    const sara = await rowOf('Sara Colombo')
    await user.click(within(sara).getByRole('button', { name: 'Sara Colombo' }))

    const dialog = await screen.findByRole('dialog', { name: 'Saldi di Sara Colombo' })
    expect(await within(dialog).findByText(/Sede principale/)).toBeInTheDocument()
  })

  it('offers Allinea and Rettifica only with can.adjust', async () => {
    respond()
    asUser()
    const { user } = renderRoutes(routes, ['/balances'])

    await user.click(within(await rowOf('Sara Colombo')).getByRole('button', { name: 'Azioni per Sara Colombo' }))
    expect(await screen.findByRole('menuitem', { name: 'Apri saldi' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Allinea alla busta paga' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Rettifica' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(within(await rowOf('Paolo Ferri')).getByRole('button', { name: 'Azioni per Paolo Ferri' }))
    expect(await screen.findByRole('menuitem', { name: 'Apri saldi' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Allinea alla busta paga' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Rettifica' })).not.toBeInTheDocument()
  })

  it('opens Rettifica from the row menu with the balances of the person', async () => {
    respond()
    asUser()
    server.use(http.get('/api/users/2/balances', () => HttpResponse.json({ data: balanceSummary() })))
    const { user } = renderRoutes(routes, ['/balances'])

    await user.click(within(await rowOf('Sara Colombo')).getByRole('button', { name: 'Azioni per Sara Colombo' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Rettifica' }))

    expect(await screen.findByRole('dialog', { name: /Rettifica/ })).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    respond(() => undefined, [])
    asUser()
    renderRoutes(routes, ['/balances'])

    await waitFor(() => expect(screen.getAllByText('Nessuna persona da mostrare.')).toHaveLength(2))
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows the error state with Riprova', async () => {
    let fail = true
    server.use(
      http.get('/api/balances', () => (fail ? HttpResponse.json({ message: 'boom' }, { status: 500 }) : HttpResponse.json(pageResponse(rows)))),
    )
    asUser()
    const { user } = renderRoutes(routes, ['/balances'])

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Non è stato possibile caricare i saldi.')
    fail = false
    await user.click(within(alert).getByRole('button', { name: 'Riprova' }))
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
  })

  it('has no accessibility violations', async () => {
    respond()
    asUser()
    const { container } = renderRoutes(routes, ['/balances'])

    await screen.findByRole('table')
    await expectNoA11yViolations(container)
  })
})
