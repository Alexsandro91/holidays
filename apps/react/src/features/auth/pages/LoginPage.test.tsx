import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import LoginPage from '@/features/auth/pages/LoginPage'
import { expectNoA11yViolations } from '@/test/axe'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/login/verify', element: <p>verify-page</p> },
]

describe('LoginPage', () => {
  it('validates the fields before calling the API and focuses the first error', async () => {
    const { user } = renderRoutes(routes, ['/login'])

    await user.click(await screen.findByRole('button', { name: 'Continua' }))

    expect(await screen.findByText('Inserisci la tua email.')).toBeInTheDocument()
    expect(screen.getByText('Inserisci la password.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()
  })

  it('rejects a malformed email', async () => {
    const { user } = renderRoutes(routes, ['/login'])

    await user.type(await screen.findByLabelText('Email'), 'giulia')
    await user.type(screen.getByLabelText('Password'), 'segreta')
    await user.click(screen.getByRole('button', { name: 'Continua' }))

    expect(await screen.findByText('Inserisci un indirizzo email valido, ad esempio nome@azienda.it.')).toBeInTheDocument()
  })

  it('moves to the code step with valid credentials', async () => {
    let body: unknown = null
    server.use(
      http.post('/api/auth/login', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ two_factor: true })
      }),
    )
    const { user, router } = renderRoutes(routes, ['/login?redirect=%2Fadmin'])

    await user.type(await screen.findByLabelText('Email'), '  admin@holidays.test ')
    await user.type(screen.getByLabelText('Password'), 'segreta')
    await user.click(screen.getByRole('button', { name: 'Continua' }))

    expect(await screen.findByText('verify-page')).toBeInTheDocument()
    expect(body).toEqual({ email: 'admin@holidays.test', password: 'segreta' })
    expect(router.state.location.state).toEqual({ email: 'admin@holidays.test' })
    expect(router.state.location.search).toBe('?redirect=%2Fadmin')
  })

  it('shows a generic error and clears the password on wrong credentials', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.json({ message: 'x', errors: { email: ['x'] } }, { status: 422 })))
    const { user } = renderRoutes(routes, ['/login'])

    await user.type(await screen.findByLabelText('Email'), 'admin@holidays.test')
    await user.type(screen.getByLabelText('Password'), 'sbagliata')
    await user.click(screen.getByRole('button', { name: 'Continua' }))

    expect(await screen.findByText('Email o password non corrette. Controlla i dati e riprova.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveFocus()
  })

  it('locks the form while throttled', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.json({ message: 'Too Many Attempts.' }, { status: 429, headers: { 'Retry-After': '30' } })))
    const { user } = renderRoutes(routes, ['/login'])

    await user.type(await screen.findByLabelText('Email'), 'admin@holidays.test')
    await user.type(screen.getByLabelText('Password'), 'sbagliata')
    await user.click(screen.getByRole('button', { name: 'Continua' }))

    // due copie: una solo per screen reader (costante), una visiva (conto alla rovescia)
    const messages = await screen.findAllByText(/Troppi tentativi\. Potrai riprovare tra \d+ secondi\./)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toHaveTextContent('tra 30 secondi.')
    expect(messages[0]).toHaveClass('sr-only')
    expect(messages[1]).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: 'Continua' })).toBeDisabled()
  })

  it('keeps the password and shows a network message when the server is unreachable', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.error()))
    const { user } = renderRoutes(routes, ['/login'])

    await user.type(await screen.findByLabelText('Email'), 'admin@holidays.test')
    await user.type(screen.getByLabelText('Password'), 'segreta')
    await user.click(screen.getByRole('button', { name: 'Continua' }))

    expect(await screen.findByText('Impossibile contattare il server. Controlla la connessione e riprova.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveValue('segreta')
  })

  it('shows a generic message on a server error', async () => {
    server.use(http.post('/api/auth/login', () => HttpResponse.json({ message: 'boom' }, { status: 500 })))
    const { user } = renderRoutes(routes, ['/login'])

    await user.type(await screen.findByLabelText('Email'), 'admin@holidays.test')
    await user.type(screen.getByLabelText('Password'), 'segreta')
    await user.click(screen.getByRole('button', { name: 'Continua' }))

    expect(await screen.findByText('Qualcosa non ha funzionato. Riprova tra poco.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toHaveValue('segreta')
  })

  it('toggles the password visibility with an accessible button', async () => {
    const { user } = renderRoutes(routes, ['/login'])
    const toggle = await screen.findByRole('button', { name: 'Mostra password' })

    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')

    await user.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
  })

  it('links the invalid email to its error message', async () => {
    const { user } = renderRoutes(routes, ['/login'])

    await user.click(await screen.findByRole('button', { name: 'Continua' }))

    const email = await screen.findByLabelText('Email')
    await screen.findByText('Inserisci la tua email.')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveAccessibleDescription('Inserisci la tua email.')
  })

  it('declares the autocomplete hints for password managers', async () => {
    renderRoutes(routes, ['/login'])

    expect(await screen.findByLabelText('Email')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('shows the notice passed in the URL', async () => {
    renderRoutes(routes, ['/login?reason=expired'])

    expect(await screen.findByText('Sessione scaduta. Accedi di nuovo.')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderRoutes(routes, ['/login'])
    await screen.findByRole('button', { name: 'Continua' })

    await expectNoA11yViolations(container)
  })
})
