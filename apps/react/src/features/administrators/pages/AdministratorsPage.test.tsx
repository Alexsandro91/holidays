import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import AdministratorsPage from '@/features/administrators/pages/AdministratorsPage'
import { expectNoA11yViolations } from '@/test/axe'
import { managedUser, userListResponse } from '@/test/usersFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ path: '/admin/administrators', element: <AdministratorsPage /> }]

const me = managedUser({ id: 1, name: 'Anna Admin', role: 'admin', role_label: 'HR / Admin', is_current_user: true })
const bruno = managedUser({ id: 3, name: 'Bruno Admin', role: 'admin', role_label: 'HR / Admin' })

const admins = (list = [me, bruno]) => server.use(http.get('/api/administrators', () => HttpResponse.json({ data: list })))

describe('AdministratorsPage', () => {
  it('lists administrators, marks you and offers revoke only on others', async () => {
    admins()
    renderRoutes(routes, ['/admin/administrators'])

    expect(await screen.findByText('Bruno Admin')).toBeInTheDocument()
    expect(screen.getByText('Tu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revoca Bruno Admin' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revoca Anna Admin' })).not.toBeInTheDocument()
  })

  it('explains that you cannot leave when you are the only admin', async () => {
    admins([me])
    renderRoutes(routes, ['/admin/administrators'])

    expect(await screen.findByText(/Sei l’unico amministratore/)).toBeInTheDocument()
  })

  it('promotes an active user with your password', async () => {
    admins()
    let body: unknown = null
    server.use(
      http.get('/api/users', () => HttpResponse.json(userListResponse([managedUser({ id: 7, name: 'Marco Bianchi' }), bruno]))),
      http.post('/api/administrators', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser({ id: 7, name: 'Marco Bianchi', role: 'admin' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    // Gli admin esistenti non compaiono tra i candidati
    expect(within(dialog).queryByRole('radio', { name: /Bruno Admin/ })).not.toBeInTheDocument()
    await user.click(await within(dialog).findByRole('radio', { name: /Marco Bianchi/ }))
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Rendi amministratore' }))

    expect(await screen.findByText('Marco Bianchi ora è amministratore.')).toBeInTheDocument()
    expect(body).toEqual({ user_id: 7, current_password: 'password' })
  })

  it('requires picking a user before sending', async () => {
    admins()
    server.use(http.get('/api/users', () => HttpResponse.json(userListResponse([managedUser({ id: 7 })]))))
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Rendi amministratore' }))

    expect(await within(dialog).findByText('Scegli un utente.')).toBeInTheDocument()
  })

  it('revokes choosing the new role, employee preselected', async () => {
    admins()
    let body: unknown = null
    server.use(
      http.delete('/api/administrators/3', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser({ id: 3, name: 'Bruno Admin', role: 'manager' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Revoca Bruno Admin' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Revocare il ruolo di amministratore a Bruno Admin?' })
    expect(within(dialog).getByRole('radio', { name: 'Dipendente' })).toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: 'Responsabile' }))
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Revoca Bruno Admin' }))

    expect(await screen.findByText('Bruno Admin non è più amministratore.')).toBeInTheDocument()
    expect(body).toEqual({ role: 'manager', current_password: 'password' })
  })

  it('shows the lockout after too many wrong passwords', async () => {
    admins()
    server.use(http.delete('/api/administrators/3', () => HttpResponse.json({ message: 'Troppi tentativi con la password. Riprova tra 15 minuti.' }, { status: 429, headers: { 'Retry-After': '900' } })))
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Revoca Bruno Admin' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Revoca Bruno Admin' }))

    expect(await within(dialog).findByText('Troppi tentativi con la password. Riprova tra 15 minuti.')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    admins()
    const { container } = renderRoutes(routes, ['/admin/administrators'])

    await screen.findByText('Bruno Admin')
    await expectNoA11yViolations(container)
  })
})
