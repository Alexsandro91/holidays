import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'
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
  { path: '/login/verify', element: <p>verify-page</p> },
  { path: '/forgot-password', element: <p>forgot-page</p> },
]

const LINK = '/reset-password/abc123?email=giulia%2Bhr%40example.test'
const NEW_PASSWORD = 'una-frase-lunga-e-nuova'
const INVALID = { message: 'x', errors: { token: ['Il link non è valido o è scaduto. Chiedine uno nuovo.'] } }
const DONE = { two_factor: true, message: 'Password aggiornata. Per entrare inserisci il codice che ti abbiamo inviato via email.' }

const fillPasswords = async (user: UserEvent, password = NEW_PASSWORD, confirmation = password) => {
  await user.type(await screen.findByLabelText('Nuova password'), password)
  await user.type(screen.getByLabelText('Conferma password'), confirmation)
}

describe('ResetPasswordPage', () => {
  it('sends token, decoded email and both passwords, then goes to the code step', async () => {
    let body: unknown = null
    server.use(
      http.post('/api/auth/reset-password', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json(DONE)
      }),
    )
    const { user, router } = renderRoutes(routes, [LINK])

    // "+" decodificato correttamente, non trasformato in spazio
    const emailInput = await screen.findByLabelText('Email')
    expect(emailInput).toHaveValue('giulia+hr@example.test')
    // In sola lettura ma visibile ai gestori di password, con l'aspetto di un campo non modificabile
    expect(emailInput).toHaveAttribute('readonly')
    expect(emailInput).toHaveAttribute('autocomplete', 'username')
    expect(emailInput).toHaveClass('bg-muted', 'text-muted-foreground')
    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    expect(await screen.findByText('verify-page')).toBeInTheDocument()
    expect(body).toEqual({ token: 'abc123', email: 'giulia+hr@example.test', password: NEW_PASSWORD, password_confirmation: NEW_PASSWORD })
    expect(router.state.location.pathname).toBe('/login/verify')
    expect(router.state.location.state).toEqual({ email: 'giulia+hr@example.test', passwordReset: true })
    // replace: tornando indietro non si ripropone il form con il link già usato
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('asks to confirm the password with the right hints', async () => {
    renderRoutes(routes, [LINK])

    const confirmation = await screen.findByLabelText('Conferma password')
    expect(confirmation).toHaveAttribute('autocomplete', 'new-password')
    expect(confirmation).toHaveAttribute('type', 'password')
  })

  it('shows a mismatch under the confirmation before calling the API', async () => {
    let calls = 0
    server.use(
      http.post('/api/auth/reset-password', () => {
        calls += 1
        return HttpResponse.json(DONE)
      }),
    )
    const { user } = renderRoutes(routes, [LINK])

    await fillPasswords(user, NEW_PASSWORD, 'una-frase-lunga-e-diversa')
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    const confirmation = screen.getByLabelText('Conferma password')
    expect(await screen.findByText('Le due password non coincidono.')).toBeInTheDocument()
    expect(confirmation).toHaveAttribute('aria-invalid', 'true')
    expect(confirmation).toHaveAccessibleDescription('Le due password non coincidono.')
    expect(confirmation).toHaveFocus()
    expect(screen.getByLabelText('Nuova password')).not.toHaveAttribute('aria-invalid')
    expect(calls).toBe(0)
  })

  it('clears the stale mismatch when the first password is corrected to match', async () => {
    const { user } = renderRoutes(routes, [LINK])

    await fillPasswords(user, NEW_PASSWORD, 'una-frase-lunga-e-diversa')
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))
    expect(await screen.findByText('Le due password non coincidono.')).toBeInTheDocument()

    // Si corregge solo il primo campo: la conferma non viene toccata
    const password = screen.getByLabelText('Nuova password')
    await user.clear(password)
    await user.type(password, 'una-frase-lunga-e-diversa')

    expect(screen.queryByText('Le due password non coincidono.')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Conferma password')).not.toHaveAttribute('aria-invalid')
  })

  it('checks the length before calling the API', async () => {
    let calls = 0
    server.use(
      http.post('/api/auth/reset-password', () => {
        calls += 1
        return HttpResponse.json(DONE)
      }),
    )
    const { user } = renderRoutes(routes, [LINK])

    await fillPasswords(user, 'corta')
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    expect(await screen.findByText('La password deve avere almeno 12 caratteri.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nuova password')).toHaveFocus()
    expect(calls).toBe(0)
  })

  it('shows the server password error under the field', async () => {
    const message = 'Password è presente negli archivi dei dati trafugati.'
    server.use(http.post('/api/auth/reset-password', () => HttpResponse.json({ message, errors: { password: [message] } }, { status: 422 })))
    const { user } = renderRoutes(routes, [LINK])

    await fillPasswords(user)
    await user.click(screen.getByRole('button', { name: 'Salva la password' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByLabelText('Nuova password')).toHaveFocus()
  })

  it('turns into "invalid link" with a way to ask for a new one', async () => {
    server.use(http.post('/api/auth/reset-password', () => HttpResponse.json(INVALID, { status: 422 })))
    const { user, router } = renderRoutes(routes, [LINK])

    await fillPasswords(user)
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
        return HttpResponse.json(DONE)
      }),
    )
    const { user } = renderRoutes(routes, [LINK])

    await fillPasswords(user)
    await user.keyboard('{Enter}{Enter}')

    expect(await screen.findByText('verify-page')).toBeInTheDocument()
    expect(calls).toBe(1)
  })

  it('locks the form while throttled', async () => {
    server.use(http.post('/api/auth/reset-password', () => HttpResponse.json({ message: 'Too Many Attempts.' }, { status: 429, headers: { 'Retry-After': '30' } })))
    const { user } = renderRoutes(routes, [LINK])

    await fillPasswords(user)
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
