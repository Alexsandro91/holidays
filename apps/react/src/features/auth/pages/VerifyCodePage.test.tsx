import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VerifyCodePage from '@/features/auth/pages/VerifyCodePage'
import { userQueryKey } from '@/lib/queryKeys'
import { expectNoA11yViolations } from '@/test/axe'
import { adminUser } from '@/test/fixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { path: '/login', element: <p>login-page</p> },
  { path: '/login/verify', element: <VerifyCodePage /> },
  { path: '/', element: <p>home-page</p> },
]

const entry = { pathname: '/login/verify', state: { email: 'giulia.rossi@example.test' } }

const acceptCode = (onRequest: (code: unknown) => void) =>
  server.use(
    http.post('/api/auth/two-factor', async ({ request }) => {
      onRequest(await request.json())
      return HttpResponse.json({ data: adminUser })
    }),
  )

describe('VerifyCodePage', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the masked email address', async () => {
    renderRoutes(routes, [entry])

    expect(await screen.findByText(/g•••@example\.test/)).toBeInTheDocument()
  })

  it('still works after a refresh without navigation state', async () => {
    renderRoutes(routes, ['/login/verify'])

    expect(await screen.findByText('Abbiamo inviato un codice di 6 cifre al tuo indirizzo email. Scade tra 10 minuti.')).toBeInTheDocument()
  })

  it('submits once after six digits, even when Enter follows', async () => {
    const bodies: unknown[] = []
    acceptCode((body) => bodies.push(body))
    const { user, queryClient } = renderRoutes(routes, [entry])

    await user.type(await screen.findByLabelText('Codice di verifica'), '482913{Enter}')

    expect(await screen.findByText('home-page')).toBeInTheDocument()
    expect(bodies).toEqual([{ code: '482913' }])
    expect(queryClient.getQueryData(userQueryKey)).toMatchObject({ email: 'admin@holidays.test' })
  })

  it('accepts a pasted code with spaces or dashes', async () => {
    const bodies: unknown[] = []
    acceptCode((body) => bodies.push(body))
    const { user } = renderRoutes(routes, [entry])

    await user.click(await screen.findByLabelText('Codice di verifica'))
    await user.paste('482 913')

    expect(await screen.findByText('home-page')).toBeInTheDocument()
    expect(bodies).toEqual([{ code: '482913' }])
  })

  it('reports the attempts left on a wrong code', async () => {
    server.use(
      http.post('/api/auth/two-factor', () =>
        HttpResponse.json({ message: 'Codice non corretto.', errors: { code: ['Codice non corretto.'] }, meta: { attempts_left: 3 } }, { status: 422 }),
      ),
    )
    const { user } = renderRoutes(routes, [entry])

    const input = await screen.findByLabelText('Codice di verifica')
    await user.type(input, '000000')

    expect(await screen.findByText('Codice non corretto. Tentativi rimasti: 3.')).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('shows the network error message when the server is unreachable', async () => {
    server.use(http.post('/api/auth/two-factor', () => HttpResponse.error()))
    const { user } = renderRoutes(routes, [entry])

    await user.type(await screen.findByLabelText('Codice di verifica'), '000000')

    expect(await screen.findByText('Impossibile contattare il server. Controlla la connessione e riprova.')).toBeInTheDocument()
  })

  it('goes back to the login page when the server asks to restart', async () => {
    server.use(http.post('/api/auth/two-factor', () => HttpResponse.json({ message: 'x', meta: { restart: true } }, { status: 422 })))
    const { user, router } = renderRoutes(routes, [{ ...entry, search: '?redirect=%2Fadmin' }])

    await user.type(await screen.findByLabelText('Codice di verifica'), '000000')

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?reason=restart&redirect=%2Fadmin')
  })

  it('keeps "send a new code" disabled during the cooldown and enables it after', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    server.use(http.post('/api/auth/two-factor/resend', () => HttpResponse.json({ message: 'ok' }, { status: 202 })))
    const { user } = renderRoutes(routes, [entry], { advanceTimers: vi.advanceTimersByTime })

    expect(await screen.findByRole('button', { name: /Nuovo codice tra/ })).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await user.click(screen.getByRole('button', { name: 'Invia un nuovo codice' }))

    expect(await screen.findByText('Nuovo codice inviato. Il precedente non è più valido.')).toBeInTheDocument()
  })

  it('stops offering new codes when the limit is reached', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    server.use(http.post('/api/auth/two-factor/resend', () => HttpResponse.json({ message: 'x', meta: { limit_reached: true } }, { status: 429 })))
    const { user } = renderRoutes(routes, [entry], { advanceTimers: vi.advanceTimersByTime })
    await screen.findByRole('button', { name: /Nuovo codice tra/ })

    await act(async () => {
      vi.advanceTimersByTime(61_000)
    })
    await user.click(screen.getByRole('button', { name: 'Invia un nuovo codice' }))

    expect(await screen.findByText('Hai raggiunto il limite di nuovi codici. Se non lo ricevi, ricomincia l’accesso.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invia un nuovo codice' })).toBeDisabled()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderRoutes(routes, [entry])
    await screen.findByLabelText('Codice di verifica')

    await expectNoA11yViolations(container)
  })
})
