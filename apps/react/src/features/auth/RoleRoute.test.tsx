import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { User } from '@/features/auth/api'
import RoleRoute from '@/features/auth/RoleRoute'
import { adminUser, currentUserResponse } from '@/test/fixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ element: <RoleRoute roles={['manager', 'admin']} />, children: [{ path: '/users', element: <p>users-page</p> }] }]

const signedInAs = (role: User['role']) => server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse({ ...adminUser, role }))))

describe('RoleRoute', () => {
  it('lets the listed roles through', async () => {
    signedInAs('manager')
    renderRoutes(routes, ['/users'])

    expect(await screen.findByText('users-page')).toBeInTheDocument()
  })

  it('lets admins through when they are listed', async () => {
    signedInAs('admin')
    renderRoutes(routes, ['/users'])

    expect(await screen.findByText('users-page')).toBeInTheDocument()
  })

  it('shows the forbidden page to the other roles', async () => {
    signedInAs('employee')
    renderRoutes(routes, ['/users'])

    expect(await screen.findByRole('heading', { name: 'Non hai i permessi per questa pagina' })).toBeInTheDocument()
    expect(screen.queryByText('users-page')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna alla home' })).toHaveAttribute('href', '/')
  })
})
