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

    expect(await screen.findByText('Troppi tentativi. Potrai riprovare tra 30 secondi.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continua' })).toBeDisabled()
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
