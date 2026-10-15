import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import LocationsPage from '@/features/locations/pages/LocationsPage'
import { expectNoA11yViolations } from '@/test/axe'
import { location, locationDetail, locationListResponse } from '@/test/locationsFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/admin/locations', element: <LocationsPage /> },
  { path: '/admin/locations/:id', element: <h1>Dettaglio sede</h1> },
  { path: '/users', element: <h1>Utenti</h1> },
]

const milano = location()
const bergamo = location({ id: 2, name: 'Bergamo', city: 'Bergamo', patron_day: 26, patron_month: 8, is_primary: false, users_count: 0, managers_count: 0 })

const listing = (onRequest: (url: URL) => void = () => undefined, active = [milano, bergamo], archived = [location({ id: 3, name: 'Torino', is_primary: false, archived_at: '2026-09-01T10:00:00+02:00', users_count: 0 })]) =>
  server.use(
    http.get('/api/locations', ({ request }) => {
      const url = new URL(request.url)
      onRequest(url)
      const list = url.searchParams.get('filter[status]') === 'archived' ? archived : active
      return HttpResponse.json(locationListResponse(list, { active: active.length, archived: archived.length }))
    }),
  )

const row = async (name: string): Promise<HTMLElement> => {
  const table = await screen.findByRole('table')
  const found = within(table).getAllByRole('row').find((item) => within(item).queryByRole('link', { name }) !== null)
  if (!found) throw new Error(`Riga ${name} mancante`)
  return found
}

describe('LocationsPage', () => {
  it('lists active locations with people, managers, badges and the counts on the tabs', async () => {
    listing()
    renderRoutes(routes, ['/admin/locations'])

    const milanoRow = await row('Sede principale')
    expect(within(milanoRow).getByText('Principale')).toBeInTheDocument()
    expect(within(milanoRow).getByText('Milano')).toBeInTheDocument()
    expect(within(milanoRow).getByText('12')).toBeInTheDocument()
    const bergamoRow = await row('Bergamo')
    expect(within(bergamoRow).getByText('Nessun responsabile')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Attive/ })).toHaveTextContent('2')
    expect(screen.getByRole('tab', { name: /Archiviate/ })).toHaveTextContent('1')
  })

  it('opens the detail from the name', async () => {
    listing()
    const { user, router } = renderRoutes(routes, ['/admin/locations'])

    await user.click(within(await row('Bergamo')).getByRole('link', { name: 'Bergamo' }))

    expect(router.state.location.pathname).toBe('/admin/locations/2')
  })

  it('shows archived locations in their tab, with the status and the sort in the URL', async () => {
    const urls: URL[] = []
    listing((url) => urls.push(url))
    const { user, router } = renderRoutes(routes, ['/admin/locations'])

    await row('Bergamo')
    await user.click(screen.getByRole('tab', { name: /Archiviate/ }))
    // Tabella e schede mobile sono entrambe nel DOM (il CSS non c'è nei test): si guarda la riga della tabella
    expect(await row('Torino')).toBeInTheDocument()
    expect(urls.at(-1)?.searchParams.get('filter[status]')).toBe('archived')
    expect(router.state.location.search).toBe('?status=archived')

    await user.click(screen.getByRole('button', { name: /Nome/ }))
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('sort')).toBe('-name'))
    expect(screen.getByRole('columnheader', { name: /Nome/ })).toHaveAttribute('aria-sort', 'descending')
  })

  it('creates a location and opens its detail', async () => {
    listing()
    let body: unknown = null
    server.use(
      http.post('/api/locations', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: locationDetail({ id: 5, name: 'Roma', is_primary: false }) }, { status: 201 })
      }),
    )
    const { user, router } = renderRoutes(routes, ['/admin/locations'])

    await user.click(await screen.findByRole('button', { name: 'Nuova sede' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nuova sede' })
    expect(within(dialog).getByText(/L’orario parte uguale a quello della sede principale/)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Nome'), 'Roma')
    await user.type(within(dialog).getByLabelText('Città'), 'Roma')
    await user.type(within(dialog).getByLabelText('Patrono (giorno/mese)'), '29/02')
    await user.click(within(dialog).getByRole('button', { name: 'Crea sede' }))

    expect(await within(dialog).findByText('Scrivi giorno e mese come 07/12, con una data che esiste.')).toBeInTheDocument()
    expect(body).toBeNull()

    await user.clear(within(dialog).getByLabelText('Patrono (giorno/mese)'))
    await user.type(within(dialog).getByLabelText('Patrono (giorno/mese)'), '29/6')
    await user.click(within(dialog).getByRole('button', { name: 'Crea sede' }))

    expect(await screen.findByText('Sede Roma creata.')).toBeInTheDocument()
    expect(body).toEqual({ name: 'Roma', city: 'Roma', patron_day: 29, patron_month: 6 })
    expect(router.state.location.pathname).toBe('/admin/locations/5')
  })

  it('shows the server errors under the fields', async () => {
    listing()
    server.use(http.post('/api/locations', () => HttpResponse.json({ message: 'x', errors: { name: ['Esiste già una sede con questo nome.'] } }, { status: 422 })))
    const { user } = renderRoutes(routes, ['/admin/locations'])

    await user.click(await screen.findByRole('button', { name: 'Nuova sede' }))
    const dialog = await screen.findByRole('dialog', { name: 'Nuova sede' })
    await user.type(within(dialog).getByLabelText('Nome'), 'Bergamo')
    await user.click(within(dialog).getByRole('button', { name: 'Crea sede' }))

    expect(await within(dialog).findByText('Esiste già una sede con questo nome.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Nome')).toHaveFocus()
  })

  it('makes a location the primary one after a confirmation', async () => {
    listing()
    let calls = 0
    server.use(
      http.post('/api/locations/2/primary', () => {
        calls += 1
        return HttpResponse.json({ data: locationDetail({ id: 2, name: 'Bergamo', is_primary: true }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations'])

    await user.click(within(await row('Bergamo')).getByRole('button', { name: 'Azioni per Bergamo' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Imposta come principale' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Rendere Bergamo la sede principale?' })
    await user.click(within(dialog).getByRole('button', { name: 'Imposta come principale' }))

    expect(await screen.findByText('Bergamo ora è la sede principale.')).toBeInTheDocument()
    expect(calls).toBe(1)
  })

  it('explains why a location with people or the primary one cannot be archived', async () => {
    listing()
    let calls = 0
    server.use(
      http.post('/api/locations/:id/archive', () => {
        calls += 1
        return HttpResponse.json({ message: 'x' }, { status: 409 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations'])

    await user.click(within(await row('Sede principale')).getByRole('button', { name: 'Azioni per Sede principale' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Archivia' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Non puoi archiviare Sede principale' })
    expect(within(dialog).getByText(/È la sede principale/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Archivia' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Ho capito' }))
    expect(calls).toBe(0)
  })

  it('archives an empty location and restores an archived one', async () => {
    listing()
    const posted: string[] = []
    server.use(
      http.post('/api/locations/2/archive', () => {
        posted.push('archive')
        return HttpResponse.json({ data: locationDetail({ id: 2, name: 'Bergamo', is_primary: false, archived_at: '2026-10-15T10:00:00+02:00' }) })
      }),
      http.post('/api/locations/3/restore', () => {
        posted.push('restore')
        return HttpResponse.json({ data: locationDetail({ id: 3, name: 'Torino', is_primary: false }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/locations'])

    await user.click(within(await row('Bergamo')).getByRole('button', { name: 'Azioni per Bergamo' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Archivia' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Archiviare Bergamo?' })).getByRole('button', { name: 'Archivia' }))
    expect(await screen.findByText('Bergamo archiviata.')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Archiviate/ }))
    await user.click(within(await row('Torino')).getByRole('button', { name: 'Azioni per Torino' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Ripristina' }))
    await user.click(within(await screen.findByRole('alertdialog', { name: 'Ripristinare Torino?' })).getByRole('button', { name: 'Ripristina' }))
    expect(await screen.findByText('Torino ripristinata.')).toBeInTheDocument()
    expect(posted).toEqual(['archive', 'restore'])
  })

  it('links to the people of a location', async () => {
    listing()
    const { user, router } = renderRoutes(routes, ['/admin/locations'])

    await user.click(within(await row('Bergamo')).getByRole('button', { name: 'Azioni per Bergamo' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Vedi persone' }))

    expect(router.state.location.pathname).toBe('/users')
    expect(router.state.location.search).toBe('?location=2')
  })

  it('has no accessibility violations', async () => {
    listing()
    const { container } = renderRoutes(routes, ['/admin/locations'])

    await row('Bergamo')
    await expectNoA11yViolations(container)
  })
})
