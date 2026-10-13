import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import AdminRoute from '@/features/auth/AdminRoute'
import { adminUser } from '@/test/fixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ element: <AdminRoute />, children: [{ path: '/admin/users', element: <p>users-page</p> }] }]

describe('AdminRoute', () => {
  it('lets admins through', async () => {
    server.use(http.get('/api/auth/user', () => HttpResponse.json({ data: adminUser })))
    renderRoutes(routes, ['/admin/users'])

    expect(await screen.findByText('users-page')).toBeInTheDocument()
  })

  it('shows the forbidden page to everyone else', async () => {
    server.use(http.get('/api/auth/user', () => HttpResponse.json({ data: { ...adminUser, role: 'employee', role_label: 'Dipendente' } })))
    renderRoutes(routes, ['/admin/users'])

    expect(await screen.findByRole('heading', { name: 'Non hai i permessi per questa pagina' })).toBeInTheDocument()
    expect(screen.queryByText('users-page')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Torna alla home' })).toHaveAttribute('href', '/')
  })
})
