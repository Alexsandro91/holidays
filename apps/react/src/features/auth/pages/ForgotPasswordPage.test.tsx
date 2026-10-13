import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ForgotPasswordPage from '@/features/auth/pages/ForgotPasswordPage'
import { expectNoA11yViolations } from '@/test/axe'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/login', element: <p>login-page</p> },
]

const SENT = { message: 'ok' }

const acceptRequests = (onRequest: (body: unknown) => void = () => undefined) =>
  server.use(
    http.post('/api/auth/forgot-password', async ({ request }) => {
      onRequest(await request.json())
      return HttpResponse.json(SENT, { status: 202 })
    }),
  )

describe('ForgotPasswordPage', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('validates the email before calling the API', async () => {
    let calls = 0
    acceptRequests(() => {
      calls += 1
    })
    const { user } = renderRoutes(routes, ['/forgot-password'])

    await user.click(await screen.findByRole('button', { name: 'Invia il link' }))

    expect(await screen.findByText('Inserisci la tua email.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()
    expect(calls).toBe(0)
  })

  it('sends the trimmed email and confirms without revealing if it exists', async () => {
    let body: unknown = null
    acceptRequests((value) => {
      body = value
    })
    const { user } = renderRoutes(routes, ['/forgot-password'])

    await user.type(await screen.findByLabelText('Email'), '  giulia@example.test ')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))

    const heading = await screen.findByRole('heading', { name: 'Controlla la tua email' })
    expect(heading).toHaveFocus()
    expect(screen.getByText(/Se giulia@example\.test corrisponde a un account attivo/)).toBeInTheDocument()
    expect(body).toEqual({ email: 'giulia@example.test' })
  })

  it('prefills the email typed on the login page', async () => {
    renderRoutes(routes, [{ pathname: '/forgot-password', state: { email: 'giulia@example.test' } }])

    expect(await screen.findByLabelText('Email')).toHaveValue('giulia@example.test')
  })

  it('keeps "send again" disabled during the cooldown', async () => {
    let calls = 0
    acceptRequests(() => {
      calls += 1
    })
    const { user } = renderRoutes(routes, ['/forgot-password'])
    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))

    // il broker ignora un nuovo link entro 60 s: il pulsante non deve promettere un'email che non arriva
    const resend = await screen.findByRole('button', { name: /Nuovo link tra \d+ s/ })
    expect(resend).toBeDisabled()
    expect(calls).toBe(1)
  })

  it('sends again after the cooldown and announces it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    acceptRequests(() => {
      calls += 1
    })
    const { user } = renderRoutes(routes, ['/forgot-password'], { advanceTimers: vi.advanceTimersByTime })
    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))
    await screen.findByRole('button', { name: /Nuovo link tra/ })

    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await user.click(screen.getByRole('button', { name: 'Invia di nuovo il link' }))

    expect(await screen.findByText('Link inviato di nuovo. Usa quello dell’ultima email: il precedente non vale più.')).toBeInTheDocument()
    expect(calls).toBe(2)
  })

  it('shows the throttle in the sent state when the resend is rejected with 429', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    server.use(
      http.post('/api/auth/forgot-password', () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json(SENT, { status: 202 })
          : HttpResponse.json({ message: 'Too Many Attempts.' }, { status: 429, headers: { 'Retry-After': '600' } })
      }),
    )
    const { user } = renderRoutes(routes, ['/forgot-password'], { advanceTimers: vi.advanceTimersByTime })
    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))
    await screen.findByRole('button', { name: /Nuovo link tra/ })

    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await user.click(screen.getByRole('button', { name: 'Invia di nuovo il link' }))

    expect(await screen.findAllByText('Troppe richieste. Potrai riprovare tra 10 minuti.')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Invia di nuovo il link' })).toBeDisabled()
  })

  it('shows the generic error when the resend fails on the server', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let calls = 0
    server.use(
      http.post('/api/auth/forgot-password', () => {
        calls += 1
        return calls === 1 ? HttpResponse.json(SENT, { status: 202 }) : HttpResponse.json({ message: 'boom' }, { status: 500 })
      }),
    )
    const { user } = renderRoutes(routes, ['/forgot-password'], { advanceTimers: vi.advanceTimersByTime })
    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))
    await screen.findByRole('button', { name: /Nuovo link tra/ })

    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await user.click(screen.getByRole('button', { name: 'Invia di nuovo il link' }))

    expect(await screen.findByText('Qualcosa non ha funzionato. Riprova tra poco.')).toBeInTheDocument()
  })

  it('goes back to the login keeping the typed email', async () => {
    const { user, router } = renderRoutes(routes, ['/forgot-password'])

    await user.type(await screen.findByLabelText('Email'), ' giulia@example.test ')
    await user.click(screen.getByRole('link', { name: 'Torna all’accesso' }))

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ email: 'giulia@example.test' })
  })

  it('keeps the email going back to the login from the sent state', async () => {
    acceptRequests()
    const { user, router } = renderRoutes(routes, ['/forgot-password'])
    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))

    await user.click(await screen.findByRole('link', { name: 'Torna all’accesso' }))

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ email: 'giulia@example.test' })
  })

  it('shows the wait in minutes when throttled', async () => {
    server.use(
      http.post('/api/auth/forgot-password', () => HttpResponse.json({ message: 'Too Many Attempts.' }, { status: 429, headers: { 'Retry-After': '600' } })),
    )
    const { user } = renderRoutes(routes, ['/forgot-password'])

    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))

    const messages = await screen.findAllByText('Troppe richieste. Potrai riprovare tra 10 minuti.')
    expect(messages).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Invia il link' })).toBeDisabled()
  })

  it('shows the server validation error under the field', async () => {
    server.use(
      http.post('/api/auth/forgot-password', () =>
        HttpResponse.json({ message: 'x', errors: { email: ['Il campo email deve essere un indirizzo email valido.'] } }, { status: 422 }),
      ),
    )
    const { user } = renderRoutes(routes, ['/forgot-password'])

    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))

    expect(await screen.findByText('Il campo email deve essere un indirizzo email valido.')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()
  })

  it('tells a network problem apart', async () => {
    server.use(http.post('/api/auth/forgot-password', () => HttpResponse.error()))
    const { user } = renderRoutes(routes, ['/forgot-password'])

    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))

    expect(await screen.findByText('Impossibile contattare il server. Controlla la connessione e riprova.')).toBeInTheDocument()
  })

  it('has no accessibility violations in both states', async () => {
    acceptRequests()
    const { user, container } = renderRoutes(routes, ['/forgot-password'])

    await user.type(await screen.findByLabelText('Email'), 'giulia@example.test')
    await expectNoA11yViolations(container)
    await user.click(screen.getByRole('button', { name: 'Invia il link' }))
    await screen.findByRole('heading', { name: 'Controlla la tua email' })
    await expectNoA11yViolations(container)
  })
})
