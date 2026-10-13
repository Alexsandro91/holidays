import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import ResetPasswordPage from '@/features/auth/pages/ResetPasswordPage'
import { expectNoA11yViolations } from '@/test/axe'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/reset-password/:token', element: <ResetPasswordPage /> },
  { path: '/login', element: <p>login-page</p> },
  { path: '/forgot-password', element: <p>forgot-page</p> },
]

const LINK = '/reset-password/abc123?email=giulia%2Bhr%40example.test'
const NEW_PASSWORD = 'una-frase-lunga-e-nuova'
const INVALID = { message: 'x', errors: { token: ['Il link non è valido o è scaduto. Chiedine uno nuovo.'] } }

describe('ResetPasswordPage', () => {
  it('sends token, decoded email and password, then goes to the login', async () => {
    let body: unknown = null
    server.use(
      http.post('/api/auth/reset-password', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ message: 'ok' })
      }),
    )
    const { user, router } = renderRoutes(routes, [LINK])

    // "+" decodificato correttamente, non trasformato in spazio
    expect(await screen.findByLabelText('Email')).toHaveValue('giulia+hr@example.test')
    await user.type(screen.getByLabelText('Nuova password'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(body).toEqual({ token: 'abc123', email: 'giulia+hr@example.test', password: NEW_PASSWORD })
    expect(router.state.location.search).toBe('?reason=password-reset')
    expect(router.state.location.state).toEqual({ email: 'giulia+hr@example.test' })
  })

  it('checks the length before calling the API', async () => {
    let calls = 0
    server.use(
      http.post('/api/auth/reset-password', () => {
        calls += 1
        return HttpResponse.json({ message: 'ok' })
      }),
    )
    const { user } = renderRoutes(routes, [LINK])

    await user.type(await screen.findByLabelText('Nuova password'), 'corta')
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    expect(await screen.findByText('La password deve avere almeno 12 caratteri.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nuova password')).toHaveFocus()
    expect(calls).toBe(0)
  })

  it('shows the server password error under the field', async () => {
    const message = 'Password è presente negli archivi dei dati trafugati.'
    server.use(http.post('/api/auth/reset-password', () => HttpResponse.json({ message, errors: { password: [message] } }, { status: 422 })))
    const { user } = renderRoutes(routes, [LINK])

    await user.type(await screen.findByLabelText('Nuova password'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText('Nuova password')).toHaveFocus()
  })

  it('turns into "invalid link" with a way to ask for a new one', async () => {
    server.use(http.post('/api/auth/reset-password', () => HttpResponse.json(INVALID, { status: 422 })))
    const { user, router } = renderRoutes(routes, [LINK])

    await user.type(await screen.findByLabelText('Nuova password'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    expect(await screen.findByRole('heading', { name: 'Link non valido' })).toHaveFocus()
    expect(screen.queryByLabelText('Nuova password')).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Chiedi un nuovo link' }))
    expect(await screen.findByText('forgot-page')).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ email: 'giulia+hr@example.test' })
  })

  it('treats a link without the email as invalid', async () => {
    renderRoutes(routes, ['/reset-password/abc123'])

    expect(await screen.findByRole('heading', { name: 'Link non valido' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Nuova password')).not.toBeInTheDocument()
  })

  it('sends a single request on double submit', async () => {
    let calls = 0
    server.use(
      http.post('/api/auth/reset-password', async () => {
        calls += 1
        await new Promise((resolve) => setTimeout(resolve, 50))
        return HttpResponse.json({ message: 'ok' })
      }),
    )
    const { user } = renderRoutes(routes, [LINK])

    await user.type(await screen.findByLabelText('Nuova password'), NEW_PASSWORD)
    await user.keyboard('{Enter}{Enter}')

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(calls).toBe(1)
  })

  it('locks the form while throttled', async () => {
    server.use(http.post('/api/auth/reset-password', () => HttpResponse.json({ message: 'Too Many Attempts.' }, { status: 429, headers: { 'Retry-After': '30' } })))
    const { user } = renderRoutes(routes, [LINK])

    await user.type(await screen.findByLabelText('Nuova password'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    const messages = await screen.findAllByText(/Troppi tentativi\. Potrai riprovare tra \d+ secondi\./)
    expect(messages[0]).toHaveTextContent('tra 30 secondi.')
    expect(screen.getByRole('button', { name: 'Salva la password' })).toBeDisabled()
  })

  it('has no accessibility violations in the form and in the invalid state', async () => {
    const { container, unmount } = renderRoutes(routes, [LINK])
    await screen.findByLabelText('Nuova password')
    await expectNoA11yViolations(container)
    unmount()

    const invalid = renderRoutes(routes, ['/reset-password/abc123'])
    await screen.findByRole('heading', { name: 'Link non valido' })
    await expectNoA11yViolations(invalid.container)
  })
})
