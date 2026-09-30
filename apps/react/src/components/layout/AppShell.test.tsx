import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { routes } from '@/routes'
import { expectNoA11yViolations } from '@/test/axe'
import { adminUser } from '@/test/fixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const signedIn = () => server.use(http.get('/api/auth/user', () => HttpResponse.json({ data: adminUser })))

describe('AppShell', () => {
  it('greets the user, sets the page title and focuses the heading', async () => {
    signedIn()
    renderRoutes(routes, ['/'])

    const heading = await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(document.title).toBe('Home · Holidays')
    expect(screen.getByRole('navigation', { name: 'Navigazione principale' })).toBeInTheDocument()
  })

  it('signs out from the account menu', async () => {
    signedIn()
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })))
    const { user, router } = renderRoutes(routes, ['/'])

    await user.click(await screen.findByRole('button', { name: /Menu account/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Esci' }))

    expect(await screen.findByText('Sei uscito. A presto.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('leaves the focus on the code field of the verification page', async () => {
    renderRoutes(routes, ['/login/verify'])

    const field = await screen.findByRole('textbox', { name: 'Codice di verifica' })
    await waitFor(() => expect(field).toHaveFocus())
    // Dopo il frame in cui il router annuncia la pagina il focus non passa al titolo
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)))
    expect(field).toHaveFocus()
  })

  it('focuses the heading on a first load of the login page', async () => {
    renderRoutes(routes, ['/login'])

    const heading = await screen.findByRole('heading', { level: 1, name: 'Accedi' })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('shows a 404 page for unknown addresses', async () => {
    renderRoutes(routes, ['/non-esiste'])

    expect(await screen.findByRole('heading', { name: 'Pagina non trovata' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    signedIn()
    const { container } = renderRoutes(routes, ['/'])
    await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })

    await expectNoA11yViolations(container)
  })
})
