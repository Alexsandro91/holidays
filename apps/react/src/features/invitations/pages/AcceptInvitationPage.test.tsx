import { act, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import AcceptInvitationPage from '@/features/invitations/pages/AcceptInvitationPage'
import { expectNoA11yViolations } from '@/test/axe'
import { adminUser } from '@/test/fixtures'
import { expectBlockedButFocusable } from '@/test/blocked'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/invitation/:token', element: <AcceptInvitationPage /> },
  { path: '/login/verify', element: <p>verify-page</p> },
  { path: '/login', element: <p>login-page</p> },
  { path: '/', element: <p>home-page</p> },
]

const PASSWORD = 'una-frase-lunga-e-nuova'

const validInvitation = () =>
  server.use(http.get('/api/invitations/abc', () => HttpResponse.json({ data: { name: 'Sara Colombo', email: 'sara@holidays.test', expires_at: '2099-01-01T00:00:00+00:00' } })))

const signedIn = () => server.use(http.get('/api/auth/user', () => HttpResponse.json({ data: adminUser })))

const fillForm = async (user: ReturnType<typeof renderRoutes>['user']) => {
  await user.type(await screen.findByLabelText('Password', { exact: true }), PASSWORD)
  await user.type(screen.getByLabelText('Conferma password'), PASSWORD)
  await user.click(screen.getByRole('checkbox', { name: 'Ho preso visione dell’informativa privacy' }))
}

describe('AcceptInvitationPage', () => {
  it('greets the invited person with the email read-only', async () => {
    validInvitation()
    renderRoutes(routes, ['/invitation/abc'])

    expect(await screen.findByRole('heading', { name: 'Benvenuto, Sara Colombo' })).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveValue('sara@holidays.test')
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly')
    expect(screen.getByRole('link', { name: 'Leggi l’informativa (si apre in una nuova scheda)' })).toHaveAttribute('target', '_blank')
  })

  it('activates and moves to the code step', async () => {
    validInvitation()
    let body: unknown = null
    server.use(
      http.post('/api/invitations/abc/accept', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ two_factor: true, message: 'ok' })
      }),
    )
    const { user, router } = renderRoutes(routes, ['/invitation/abc'])

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Attiva account' }))

    expect(await screen.findByText('verify-page')).toBeInTheDocument()
    expect(body).toEqual({ password: PASSWORD, password_confirmation: PASSWORD, privacy_acknowledged: true })
    expect(router.state.location.state).toEqual({ email: 'sara@holidays.test', invitationAccepted: true })
  })

  it('never activates twice while the code page is loading', async () => {
    validInvitation()
    let calls = 0
    server.use(
      http.post('/api/invitations/abc/accept', () => {
        calls += 1
        return HttpResponse.json({ two_factor: true, message: 'ok' })
      }),
    )
    // La pagina del codice resta in caricamento: tra l'attivazione e il cambio pagina c'è una finestra
    const slowRoutes: RouteObject[] = [...routes.filter((route) => route.path !== '/login/verify'), { path: '/login/verify', loader: () => new Promise(() => undefined), element: <p>verify-page</p> }]
    const { user, router } = renderRoutes(slowRoutes, ['/invitation/abc'])

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Attiva account' }))
    await waitFor(() => expect(router.state.navigation.state).toBe('loading'))
    await user.click(screen.getByRole('button', { name: 'Attiva account' }))
    await act(() => new Promise((resolve) => window.setTimeout(resolve, 100)))

    expect(calls).toBe(1)
  })

  it('locks the form while throttled, keeping the focus on the button', async () => {
    validInvitation()
    let calls = 0
    server.use(
      http.post('/api/invitations/abc/accept', () => {
        calls += 1
        return HttpResponse.json({ message: 'Too Many Attempts.' }, { status: 429, headers: { 'Retry-After': '30' } })
      }),
    )
    const { user } = renderRoutes(routes, ['/invitation/abc'])

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Attiva account' }))

    expect(await screen.findAllByText(/Troppi tentativi\. Potrai riprovare tra \d+ secondi\./)).toHaveLength(2)
    const button = screen.getByRole('button', { name: 'Attiva account' })
    expectBlockedButFocusable(button)
    expect(button).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(calls).toBe(1)
  })

  it('requires matching passwords and the privacy acknowledgment', async () => {
    validInvitation()
    const { user } = renderRoutes(routes, ['/invitation/abc'])

    await user.type(await screen.findByLabelText('Password', { exact: true }), PASSWORD)
    await user.type(screen.getByLabelText('Conferma password'), 'diversa-ma-abbastanza-lunga')
    await user.click(screen.getByRole('button', { name: 'Attiva account' }))

    expect(await screen.findByText('Le due password non coincidono.')).toBeInTheDocument()
    expect(screen.getByText('Per continuare conferma di aver preso visione dell’informativa.')).toBeInTheDocument()
  })

  it('explains an expired invitation', async () => {
    server.use(http.get('/api/invitations/abc', () => HttpResponse.json({ message: 'expired' }, { status: 410 })))
    renderRoutes(routes, ['/invitation/abc'])

    expect(await screen.findByRole('heading', { name: 'Invito scaduto' })).toBeInTheDocument()
    expect(screen.getByText('Chiedi all’ufficio HR di inviartene uno nuovo.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vai all’accesso' })).toHaveAttribute('href', '/login')
  })

  it('moves focus to the title once the invitation is loaded', async () => {
    validInvitation()
    renderRoutes(routes, ['/invitation/abc'])

    const heading = await screen.findByRole('heading', { name: 'Benvenuto, Sara Colombo' })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('moves focus to the title of an expired invitation', async () => {
    server.use(http.get('/api/invitations/abc', () => HttpResponse.json({ message: 'expired' }, { status: 410 })))
    renderRoutes(routes, ['/invitation/abc'])

    const heading = await screen.findByRole('heading', { name: 'Invito scaduto' })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('shows a titled error with retry when the server is unreachable', async () => {
    let calls = 0
    server.use(
      http.get('/api/invitations/abc', () => {
        calls += 1
        return calls === 1 ? HttpResponse.json({ message: 'boom' }, { status: 500 }) : HttpResponse.json({ data: { name: 'Sara Colombo', email: 'sara@holidays.test', expires_at: '2099-01-01T00:00:00+00:00' } })
      }),
    )
    const { user } = renderRoutes(routes, ['/invitation/abc'])

    const heading = await screen.findByRole('heading', { level: 1, name: 'Impossibile caricare l’invito' })
    await waitFor(() => expect(heading).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'Riprova' }))

    const formHeading = await screen.findByRole('heading', { name: 'Benvenuto, Sara Colombo' })
    await waitFor(() => expect(formHeading).toHaveFocus())
  })

  it('explains an invalid or used invitation, also when it fails on submit', async () => {
    validInvitation()
    server.use(http.post('/api/invitations/abc/accept', () => HttpResponse.json({ message: 'invalid' }, { status: 404 })))
    const { user } = renderRoutes(routes, ['/invitation/abc'])

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Attiva account' }))

    expect(await screen.findByRole('heading', { name: 'Invito non valido' })).toHaveFocus()
  })

  it('shows a server password error under the field', async () => {
    validInvitation()
    server.use(http.post('/api/invitations/abc/accept', () => HttpResponse.json({ message: 'x', errors: { password: ['Password trafugata.'] } }, { status: 422 })))
    const { user } = renderRoutes(routes, ['/invitation/abc'])

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Attiva account' }))

    expect(await screen.findByText('Password trafugata.')).toBeInTheDocument()
    expect(screen.getByLabelText('Password', { exact: true })).toHaveFocus()
  })

  it('has no accessibility violations', async () => {
    validInvitation()
    const { container } = renderRoutes(routes, ['/invitation/abc'])

    await screen.findByRole('heading', { name: 'Benvenuto, Sara Colombo' })
    await expectNoA11yViolations(container)
  })

  it('asks a signed-in user to sign out before activating, without loading the invitation', async () => {
    signedIn()
    let invitationCalls = 0
    server.use(
      http.get('/api/invitations/abc', () => {
        invitationCalls += 1
        return HttpResponse.json({ message: 'Hai già una sessione aperta.', meta: { reason: 'already_authenticated' } }, { status: 409 })
      }),
    )
    renderRoutes(routes, ['/invitation/abc'])

    const heading = await screen.findByRole('heading', { level: 1, name: 'Sei già connesso' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(screen.getByText('Hai già una sessione aperta come Giulia Rossi (admin@holidays.test). Per attivare questo invito esci prima.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vai alla home' })).toHaveAttribute('href', '/')
    expect(invitationCalls).toBe(0)
  })

  it('loads the invitation after signing out from the notice', async () => {
    let signedOut = false
    server.use(
      http.get('/api/auth/user', () => (signedOut ? HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 }) : HttpResponse.json({ data: adminUser }))),
      http.post('/api/auth/logout', () => {
        signedOut = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    validInvitation()
    const { user, router } = renderRoutes(routes, ['/invitation/abc'])

    await user.click(await screen.findByRole('button', { name: 'Esci' }))

    const formHeading = await screen.findByRole('heading', { name: 'Benvenuto, Sara Colombo' })
    await waitFor(() => expect(formHeading).toHaveFocus())
    expect(router.state.location.pathname).toBe('/invitation/abc')
  })

  it('keeps the notice and explains when signing out fails', async () => {
    signedIn()
    server.use(http.post('/api/auth/logout', () => HttpResponse.json({ message: 'boom' }, { status: 500 })))
    const { user } = renderRoutes(routes, ['/invitation/abc'])

    await user.click(await screen.findByRole('button', { name: 'Esci' }))

    expect(await screen.findByText('Uscita non riuscita. Riprova.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Sei già connesso' })).toBeInTheDocument()
  })

  it('shows the signed-in notice when the activation finds a session already open', async () => {
    validInvitation()
    let sessionOpen = false
    server.use(
      http.get('/api/auth/user', () => (sessionOpen ? HttpResponse.json({ data: adminUser }) : HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 }))),
      http.post('/api/invitations/abc/accept', () => {
        // Accesso fatto nel frattempo in un'altra scheda
        sessionOpen = true
        return HttpResponse.json({ message: 'Hai già una sessione aperta.', meta: { reason: 'already_authenticated' } }, { status: 409 })
      }),
    )
    const { user } = renderRoutes(routes, ['/invitation/abc'])

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Attiva account' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sei già connesso' })).toBeInTheDocument()
    expect(screen.queryByText('Qualcosa non ha funzionato. Riprova tra poco.')).not.toBeInTheDocument()
  })

  it('has no accessibility violations on the signed-in notice', async () => {
    signedIn()
    const { container } = renderRoutes(routes, ['/invitation/abc'])

    await screen.findByRole('heading', { level: 1, name: 'Sei già connesso' })
    await expectNoA11yViolations(container)
  })
})
