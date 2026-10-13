import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import UsersAdminPage from '@/features/users/pages/UsersAdminPage'
import { expectNoA11yViolations } from '@/test/axe'
import { managedUser, userListResponse } from '@/test/usersFixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ path: '/admin/users', element: <UsersAdminPage /> }]

const listing = (users = [managedUser()]) => server.use(http.get('/api/users', () => HttpResponse.json(userListResponse(users))))

const openMenu = async (user: ReturnType<typeof renderRoutes>['user'], name: string) => {
  const table = await screen.findByRole('table')
  await user.click(within(table).getByRole('button', { name: `Azioni per ${name}` }))
}

describe('UsersAdminPage', () => {
  it('invites a user and shows the server errors under the fields', async () => {
    listing()
    let body: unknown = null
    server.use(
      http.post('/api/users', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ message: 'x', errors: { email: ['L’email è già in uso.'] } }, { status: 422 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/users'])

    await user.click(await screen.findByRole('button', { name: 'Invita utente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invita utente' })
    await user.type(within(dialog).getByLabelText('Nome e cognome'), 'Sara Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.click(within(dialog).getByRole('button', { name: 'Invia invito' }))

    expect(await within(dialog).findByText('L’email è già in uso.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Email aziendale')).toHaveFocus()
    expect(body).toEqual({ name: 'Sara Colombo', email: 'sara@holidays.test', role: 'employee' })
  })

  it('closes the invite dialog and refreshes the list on success', async () => {
    let listCalls = 0
    server.use(
      http.get('/api/users', () => {
        listCalls += 1
        return HttpResponse.json(userListResponse([managedUser()]))
      }),
      http.post('/api/users', () => HttpResponse.json({ data: managedUser({ id: 9, status: 'invited' }) }, { status: 201 })),
    )
    const { user } = renderRoutes(routes, ['/admin/users'])

    await user.click(await screen.findByRole('button', { name: 'Invita utente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invita utente' })
    await user.type(within(dialog).getByLabelText('Nome e cognome'), 'Sara Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.click(within(dialog).getByRole('button', { name: 'Invia invito' }))

    expect(await screen.findByText('Invito inviato a sara@holidays.test.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(listCalls).toBeGreaterThan(1)
  })

  it('shows only the actions that fit the row', async () => {
    listing([managedUser({ status: 'invited', name: 'Luca Ferrari' })])
    const { user } = renderRoutes(routes, ['/admin/users'])

    await openMenu(user, 'Luca Ferrari')

    expect(await screen.findByRole('menuitem', { name: 'Reinvia invito' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Annulla invito' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Disattiva' })).not.toBeInTheDocument()
  })

  it('disables an employee after an explicit confirmation', async () => {
    listing([managedUser()])
    let called = false
    server.use(
      http.post('/api/users/2/disable', () => {
        called = true
        return HttpResponse.json({ data: managedUser({ status: 'disabled' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Disattiva' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Disattivare Marco Bianchi?' })
    expect(within(dialog).queryByLabelText('La tua password')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Disattiva Marco Bianchi' }))

    expect(await screen.findByText('Marco Bianchi è stato disattivato.')).toBeInTheDocument()
    expect(called).toBe(true)
  })

  it('asks for the password to disable an admin and shows a wrong password under the field', async () => {
    listing([managedUser({ role: 'admin', role_label: 'HR / Admin', name: 'Bruno Admin' })])
    server.use(
      http.post('/api/users/2/disable', () => HttpResponse.json({ message: 'x', errors: { current_password: ['La password non è corretta.'] } }, { status: 422 })),
    )
    const { user } = renderRoutes(routes, ['/admin/users'])

    await openMenu(user, 'Bruno Admin')
    await user.click(await screen.findByRole('menuitem', { name: 'Disattiva' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Disattivare Bruno Admin?' })
    expect(within(dialog).getByText('È un amministratore: tutti gli amministratori riceveranno un’email.')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('La tua password'), 'sbagliata')
    await user.click(within(dialog).getByRole('button', { name: 'Disattiva Bruno Admin' }))

    expect(await within(dialog).findByText('La password non è corretta.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('La tua password')).toHaveFocus()
  })

  it('changes the role between employee and manager only', async () => {
    listing([managedUser()])
    let body: unknown = null
    server.use(
      http.patch('/api/users/2/role', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser({ role: 'manager', role_label: 'Responsabile' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Cambia ruolo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cambia ruolo di Marco Bianchi' })
    expect(within(dialog).queryByRole('radio', { name: /Admin/ })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: 'Responsabile' }))
    await user.click(within(dialog).getByRole('button', { name: 'Salva ruolo' }))

    expect(await screen.findByText('Ruolo di Marco Bianchi aggiornato.')).toBeInTheDocument()
    expect(body).toEqual({ role: 'manager' })
  })

  it('shows the wait when resending too early', async () => {
    listing([managedUser({ status: 'invited', name: 'Luca Ferrari' })])
    server.use(http.post('/api/users/2/invitation', () => HttpResponse.json({ message: 'Attendi 42 secondi prima di inviare di nuovo l’invito.', meta: { retry_after: 42 } }, { status: 429, headers: { 'Retry-After': '42' } })))
    const { user } = renderRoutes(routes, ['/admin/users'])

    await openMenu(user, 'Luca Ferrari')
    await user.click(await screen.findByRole('menuitem', { name: 'Reinvia invito' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reinvia' }))

    expect(await screen.findByText('Attendi 42 secondi prima di inviare di nuovo l’invito.')).toBeInTheDocument()
  })

  it('has no accessibility violations with the invite dialog open', async () => {
    listing()
    const { user, baseElement } = renderRoutes(routes, ['/admin/users'])

    await user.click(await screen.findByRole('button', { name: 'Invita utente' }))
    await screen.findByRole('dialog', { name: 'Invita utente' })
    await expectNoA11yViolations(baseElement)
  })
})
