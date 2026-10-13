import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import AcceptInvitationPage from '@/features/invitations/pages/AcceptInvitationPage'
import { expectNoA11yViolations } from '@/test/axe'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/invitation/:token', element: <AcceptInvitationPage /> },
  { path: '/login/verify', element: <p>verify-page</p> },
  { path: '/login', element: <p>login-page</p> },
]

const PASSWORD = 'una-frase-lunga-e-nuova'

const validInvitation = () =>
  server.use(http.get('/api/invitations/abc', () => HttpResponse.json({ data: { name: 'Sara Colombo', email: 'sara@holidays.test', expires_at: '2099-01-01T00:00:00+00:00' } })))

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
})
