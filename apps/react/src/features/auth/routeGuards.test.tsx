import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import GuestRoute from '@/features/auth/GuestRoute'
import ProtectedRoute from '@/features/auth/ProtectedRoute'
import { userQueryKey } from '@/lib/queryKeys'
import { adminUser } from '@/test/fixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [
  { element: <GuestRoute />, children: [{ path: '/login', element: <p>login-page</p> }] },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <p>home-page</p> },
      { path: '/admin', element: <p>admin-page</p> },
    ],
  },
]

const signedIn = () => server.use(http.get('/api/auth/user', () => HttpResponse.json({ data: adminUser })))

describe('route guards', () => {
  it('sends guests to the login page with a way back', async () => {
    const { router } = renderRoutes(routes, ['/admin?tab=2'])

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?redirect=%2Fadmin%3Ftab%3D2')
  })

  it('shows protected pages to signed-in users', async () => {
    signedIn()
    renderRoutes(routes, ['/'])

    expect(await screen.findByText('home-page')).toBeInTheDocument()
  })

  it('sends signed-in users from the login page to the redirect target', async () => {
    signedIn()
    renderRoutes(routes, ['/login?redirect=%2Fadmin'])

    expect(await screen.findByText('admin-page')).toBeInTheDocument()
  })

  it('ignores external redirect targets', async () => {
    signedIn()
    renderRoutes(routes, ['/login?redirect=https%3A%2F%2Fevil.test'])

    expect(await screen.findByText('home-page')).toBeInTheDocument()
  })

  it('marks the session as expired when the user check starts failing', async () => {
    signedIn()
    const { router, queryClient } = renderRoutes(routes, ['/admin'])
    await screen.findByText('admin-page')

    server.use(http.get('/api/auth/user', () => HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })))
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: userQueryKey })
    })

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?redirect=%2Fadmin&reason=expired')
  })

  it('shows the signed-out notice after a logout', async () => {
    signedIn()
    const { router, queryClient } = renderRoutes(routes, ['/'])
    await screen.findByText('home-page')

    act(() => {
      queryClient.setQueryData(userQueryKey, null)
    })

    expect(await screen.findByText('login-page')).toBeInTheDocument()
    expect(router.state.location.search).toBe('?reason=logged-out')
  })

  it('shows the server error state to guests when the user check fails with a server error', async () => {
    server.use(http.get('/api/auth/user', () => HttpResponse.json({ message: 'boom' }, { status: 500 })))
    renderRoutes(routes, ['/'])

    expect(await screen.findByRole('button', { name: 'Riprova' })).toBeInTheDocument()
    // Il server ha risposto: non è un problema di connessione
    expect(screen.getByText('Qualcosa non ha funzionato. Riprova tra poco.')).toBeInTheDocument()
    expect(screen.queryByText(/Controlla la connessione/)).not.toBeInTheDocument()
  })

  it('suggests checking the connection when the server cannot be reached', async () => {
    server.use(http.get('/api/auth/user', () => HttpResponse.error()))
    renderRoutes(routes, ['/'])

    expect(await screen.findByText('Impossibile contattare il server. Controlla la connessione e riprova.')).toBeInTheDocument()
  })

  it('keeps the protected page when a background refresh fails with a server error', async () => {
    signedIn()
    const { queryClient } = renderRoutes(routes, ['/admin'])
    await screen.findByText('admin-page')

    server.use(http.get('/api/auth/user', () => HttpResponse.json({ message: 'boom' }, { status: 500 })))
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: userQueryKey })
    })

    expect(screen.getByText('admin-page')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Riprova' })).not.toBeInTheDocument()
  })
})
