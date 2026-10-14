import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { routes } from '@/routes'
import { expectNoA11yViolations } from '@/test/axe'
import { userQueryKey } from '@/lib/queryKeys'
import { adminUser } from '@/test/fixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const signedIn = () => server.use(http.get('/api/auth/user', () => HttpResponse.json({ data: adminUser })))

describe('AppShell', () => {
  it('greets the user, sets the page title and focuses the heading', async () => {
    signedIn()
    renderRoutes(routes, ['/'], { toaster: false })

    const heading = await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(document.title).toBe('Home · Holidays')
    expect(screen.getByRole('navigation', { name: 'Navigazione principale' })).toBeInTheDocument()
  })

  it('signs out from the account menu', async () => {
    signedIn()
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })))
    const { user, router } = renderRoutes(routes, ['/'], { toaster: false })

    await user.click(await screen.findByRole('button', { name: /Menu account/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Esci' }))

    expect(await screen.findByText('Sei uscito. A presto.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('keeps the user signed in when the sign-out fails on the server', async () => {
    signedIn()
    server.use(http.post('/api/auth/logout', () => HttpResponse.json({ message: 'Server Error' }, { status: 500 })))
    const { user, router } = renderRoutes(routes, ['/'], { toaster: false })

    await user.click(await screen.findByRole('button', { name: /Menu account/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Esci' }))

    expect(await screen.findByText('Uscita non riuscita. Riprova.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Ciao, Giulia' })).toBeInTheDocument()
    expect(screen.queryByText('Sei uscito. A presto.')).not.toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')
  })

  it('treats an already expired session as signed out', async () => {
    let expired = false
    server.use(
      http.get('/api/auth/user', () =>
        expired ? HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 }) : HttpResponse.json({ data: adminUser }),
      ),
      http.post('/api/auth/logout', () => {
        // La sessione era già scaduta sul server: anche l'utente corrente risponde 401
        expired = true
        return HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })
      }),
    )
    const { user, router } = renderRoutes(routes, ['/'], { toaster: false })

    await user.click(await screen.findByRole('button', { name: /Menu account/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Esci' }))

    expect(await screen.findByText('Sei uscito. A presto.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('leaves the focus on the code field of the verification page', async () => {
    renderRoutes(routes, ['/login/verify'], { toaster: false })

    const field = await screen.findByRole('textbox', { name: 'Codice di verifica' })
    await waitFor(() => expect(field).toHaveFocus())
    // Dopo il frame in cui il router annuncia la pagina il focus non passa al titolo
    await new Promise((resolve) => window.requestAnimationFrame(() => resolve(null)))
    expect(field).toHaveFocus()
  })

  it('focuses the heading on a first load of the login page', async () => {
    renderRoutes(routes, ['/login'], { toaster: false })

    const heading = await screen.findByRole('heading', { level: 1, name: 'Accedi' })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('shows a 404 page for unknown addresses', async () => {
    renderRoutes(routes, ['/non-esiste'], { toaster: false })

    expect(await screen.findByRole('heading', { name: 'Pagina non trovata' })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    signedIn()
    const { container } = renderRoutes(routes, ['/'], { toaster: false })
    await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })

    await expectNoA11yViolations(container)
  })

  it('shows the administration group only to admins', async () => {
    signedIn()
    const first = renderRoutes(routes, ['/'], { toaster: false })

    expect(await screen.findByRole('link', { name: 'Utenti' })).toHaveAttribute('href', '/admin/users')
    expect(screen.getByRole('link', { name: 'Amministratori' })).toHaveAttribute('href', '/admin/administrators')
    first.unmount()

    server.use(http.get('/api/auth/user', () => HttpResponse.json({ data: { ...adminUser, role: 'employee', role_label: 'Dipendente' } })))
    renderRoutes(routes, ['/'], { toaster: false })

    await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })
    expect(screen.queryByRole('link', { name: 'Utenti' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Amministratori' })).not.toBeInTheDocument()
  })

  it('marks the current page in the menu with aria-current and the active style', async () => {
    signedIn()
    renderRoutes(routes, ['/'], { toaster: false })

    const home = await screen.findByRole('link', { name: 'Home' })
    expect(home).toHaveAttribute('aria-current', 'page')
    // Stile attivo (sfondo pieno, grassetto e barra a sinistra) legato a data-active della voce
    expect(home).toHaveAttribute('data-active', 'true')
    const users = screen.getByRole('link', { name: 'Utenti' })
    expect(users).not.toHaveAttribute('aria-current')
    expect(users).toHaveAttribute('data-active', 'false')
  })

  it('lets the pages use the full width and keeps a reading width on the home page', async () => {
    signedIn()
    renderRoutes(routes, ['/'], { toaster: false })

    const heading = await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })
    // Il contenuto dell'area riservata non ha più un limite: le tabelle usano tutta la larghezza
    expect(screen.getByRole('main').querySelector('.max-w-6xl')).toBeNull()
    // Le pagine di solo testo tengono una larghezza di lettura propria
    expect(heading.closest('.max-w-3xl')).not.toBeNull()
  })

  it('logging out drops every cached admin query', async () => {
    signedIn()
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })))
    const { user, queryClient } = renderRoutes(routes, ['/'], { toaster: false })
    queryClient.setQueryData(['admin', 'users', {}], { data: [] })

    await user.click(await screen.findByRole('button', { name: /Menu account/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Esci' }))

    expect(await screen.findByText('Sei uscito. A presto.')).toBeInTheDocument()
    expect(queryClient.getQueryData(['admin', 'users', {}])).toBeUndefined()
    expect(queryClient.getQueryData(userQueryKey)).toBeNull()
  })

  it('logging out forgets the mutations, with the admin passwords they carried', async () => {
    signedIn()
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })))
    const { user, queryClient } = renderRoutes(routes, ['/'], { toaster: false })
    // Una promozione già conclusa: le variabili (password compresa) restano nella cache delle mutation
    await queryClient
      .getMutationCache()
      .build(queryClient, { mutationFn: (input: { currentPassword: string }) => Promise.resolve(input) })
      .execute({ currentPassword: 'password-admin' })
    expect(queryClient.getMutationCache().getAll()).not.toHaveLength(0)

    await user.click(await screen.findByRole('button', { name: /Menu account/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Esci' }))

    expect(await screen.findByText('Sei uscito. A presto.')).toBeInTheDocument()
    expect(queryClient.getMutationCache().getAll()).toHaveLength(0)
  })
})
