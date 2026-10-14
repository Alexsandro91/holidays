import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import ChangeRoleDialog from '@/features/users/components/ChangeRoleDialog'
import UsersAdminPage from '@/features/users/pages/UsersAdminPage'
import { expectNoA11yViolations } from '@/test/axe'
import { holdDialogExitAnimation } from '@/test/dialogExit'
import { managedUser, userListResponse } from '@/test/usersFixtures'
import { waitForStrayRequests } from '@/test/network'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const routes: RouteObject[] = [{ path: '/users', element: <UsersAdminPage /> }]

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
    const { user } = renderRoutes(routes, ['/users'])

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
    const { user } = renderRoutes(routes, ['/users'])

    await user.click(await screen.findByRole('button', { name: 'Invita utente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invita utente' })
    await user.type(within(dialog).getByLabelText('Nome e cognome'), 'Sara Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.click(within(dialog).getByRole('button', { name: 'Invia invito' }))

    expect(await screen.findByText('Invito inviato a sara@holidays.test.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(listCalls).toBeGreaterThan(1)
  })

  it('never sends the invitation twice and accepts a new one after reopening the dialog', async () => {
    holdDialogExitAnimation()
    listing()
    let calls = 0
    server.use(
      http.post('/api/users', () => {
        calls += 1
        return HttpResponse.json({ data: managedUser({ id: 9, status: 'invited' }) }, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])
    const invite = async (email: string) => {
      const dialog = await screen.findByRole('dialog', { name: 'Invita utente' })
      await user.type(within(dialog).getByLabelText('Nome e cognome'), 'Sara Colombo')
      await user.type(within(dialog).getByLabelText('Email aziendale'), email)
      await user.click(within(dialog).getByRole('button', { name: 'Invia invito' }))
      return dialog
    }

    await user.click(await screen.findByRole('button', { name: 'Invita utente' }))
    const dialog = await invite('sara@holidays.test')
    await screen.findByText('Invito inviato a sara@holidays.test.')
    expect(dialog).toHaveAttribute('data-state', 'closed')
    await user.keyboard('{Enter}')
    await waitForStrayRequests()
    expect(calls).toBe(1)

    // Riaperto, il dialog accetta un nuovo invito
    fireEvent.click(screen.getByRole('button', { name: 'Invita utente', hidden: true }))
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'))
    await invite('luca@holidays.test')

    await waitFor(() => expect(calls).toBe(2))
  })

  it('shows only the actions that fit the row', async () => {
    listing([managedUser({ status: 'invited', name: 'Luca Ferrari' })])
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Luca Ferrari')

    expect(await screen.findByRole('menuitem', { name: 'Reinvia invito' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Annulla invito' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Disattiva' })).not.toBeInTheDocument()
  })

  it('offers to resend an invitation without expiry', async () => {
    listing([managedUser({ status: 'invited', status_label: 'Invitato', invitation_expires_at: null, name: 'Luca Ferrari' })])
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Luca Ferrari')

    expect(await screen.findByRole('menuitem', { name: 'Reinvia invito' })).toBeInTheDocument()
  })

  it('leaves no empty space in the mobile card of a row without actions', async () => {
    listing([managedUser({ id: 1, name: 'Anna Admin', is_current_user: true }), managedUser()])
    renderRoutes(routes, ['/users'])
    await screen.findByRole('table')

    const cards = screen.getAllByRole('listitem')
    const mine = cards.find((item) => item.textContent?.includes('Anna Admin'))
    const other = cards.find((item) => item.textContent?.includes('Marco Bianchi'))
    // Nella griglia della scheda un contenitore vuoto aggiunge comunque uno spazio
    expect(mine?.querySelectorAll(':scope > :empty')).toHaveLength(0)
    // Solo il contenuto: senza azioni la colonna del menu non c'è
    expect(mine?.children).toHaveLength(1)
    expect(other && within(other).getByRole('button', { name: 'Azioni per Marco Bianchi' })).toBeInTheDocument()
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
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Disattiva' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Disattivare Marco Bianchi?' })
    expect(within(dialog).queryByLabelText('La tua password')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Disattiva Marco Bianchi' }))

    expect(await screen.findByText('Marco Bianchi è stato disattivato.')).toBeInTheDocument()
    expect(called).toBe(true)
  })

  it('never disables twice while the confirmation is closing', async () => {
    holdDialogExitAnimation()
    listing([managedUser()])
    let calls = 0
    server.use(
      http.post('/api/users/2/disable', () => {
        calls += 1
        return HttpResponse.json({ data: managedUser({ status: 'disabled' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Disattiva' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Disattivare Marco Bianchi?' })
    await user.click(within(dialog).getByRole('button', { name: 'Disattiva Marco Bianchi' }))
    expect(await screen.findByText('Marco Bianchi è stato disattivato.')).toBeInTheDocument()
    // Durante l'animazione di chiusura il pulsante è ancora lì: un secondo Invio non deve ripartire
    expect(dialog).toHaveAttribute('data-state', 'closed')
    await user.keyboard('{Enter}')
    await waitForStrayRequests()

    expect(calls).toBe(1)
  })

  it('asks for the password to disable an admin and shows a wrong password under the field', async () => {
    listing([managedUser({ role: 'admin', role_label: 'HR / Admin', name: 'Bruno Admin' })])
    server.use(
      http.post('/api/users/2/disable', () => HttpResponse.json({ message: 'x', errors: { current_password: ['La password non è corretta.'] } }, { status: 422 })),
    )
    const { user } = renderRoutes(routes, ['/users'])

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
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Cambia ruolo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cambia ruolo di Marco Bianchi' })
    expect(within(dialog).queryByRole('radio', { name: /Admin/ })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('radio', { name: 'Responsabile' }))
    await user.click(within(dialog).getByRole('button', { name: 'Salva ruolo' }))

    expect(await screen.findByText('Ruolo di Marco Bianchi aggiornato.')).toBeInTheDocument()
    expect(body).toEqual({ role: 'manager' })
  })

  it('never saves the role twice before the dialog closes', async () => {
    let calls = 0
    server.use(
      http.patch('/api/users/2/role', () => {
        calls += 1
        return HttpResponse.json({ data: managedUser({ role: 'manager', role_label: 'Responsabile' }) })
      }),
    )
    // onClose che non chiude: resta aperta la finestra tra la risposta positiva e la chiusura
    const { user } = renderRoutes([{ path: '/', element: <ChangeRoleDialog user={managedUser()} onClose={() => undefined} /> }])

    const dialog = await screen.findByRole('dialog', { name: 'Cambia ruolo di Marco Bianchi' })
    await user.click(within(dialog).getByRole('radio', { name: 'Responsabile' }))
    await user.click(within(dialog).getByRole('button', { name: 'Salva ruolo' }))
    await screen.findByText('Ruolo di Marco Bianchi aggiornato.')
    await user.click(within(dialog).getByRole('button', { name: 'Salva ruolo' }))
    await waitForStrayRequests()

    expect(calls).toBe(1)
  })

  it('keeps "Salva ruolo" disabled until a different role is chosen', async () => {
    listing([managedUser()])
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Cambia ruolo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cambia ruolo di Marco Bianchi' })
    expect(within(dialog).getByRole('button', { name: 'Salva ruolo' })).toBeDisabled()

    await user.click(within(dialog).getByRole('radio', { name: 'Responsabile' }))
    expect(within(dialog).getByRole('button', { name: 'Salva ruolo' })).toBeEnabled()
    await user.click(within(dialog).getByRole('radio', { name: 'Dipendente' }))
    expect(within(dialog).getByRole('button', { name: 'Salva ruolo' })).toBeDisabled()
  })

  it('does not close the invite dialog while the request is pending', async () => {
    listing()
    server.use(
      http.post('/api/users', async () => {
        await delay(300)
        return HttpResponse.json({ data: managedUser({ id: 9, status: 'invited' }) }, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await user.click(await screen.findByRole('button', { name: 'Invita utente' }))
    const dialog = await screen.findByRole('dialog', { name: 'Invita utente' })
    await user.type(within(dialog).getByLabelText('Nome e cognome'), 'Sara Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.click(within(dialog).getByRole('button', { name: 'Invia invito' }))
    await user.keyboard('{Escape}')

    expect(screen.getByRole('dialog', { name: 'Invita utente' })).toBeInTheDocument()
    expect(await screen.findByText('Invito inviato a sara@holidays.test.')).toBeInTheDocument()
  })

  it('shows the wait when resending too early', async () => {
    listing([managedUser({ status: 'invited', name: 'Luca Ferrari' })])
    server.use(http.post('/api/users/2/invitation', () => HttpResponse.json({ message: 'Attendi 42 secondi prima di inviare di nuovo l’invito.', meta: { retry_after: 42 } }, { status: 429, headers: { 'Retry-After': '42' } })))
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Luca Ferrari')
    await user.click(await screen.findByRole('menuitem', { name: 'Reinvia invito' }))
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reinvia' }))

    expect(await screen.findByText('Attendi 42 secondi prima di inviare di nuovo l’invito.')).toBeInTheDocument()
  })

  it('has no accessibility violations with the invite dialog open', async () => {
    listing()
    const { user, baseElement } = renderRoutes(routes, ['/users'])

    await user.click(await screen.findByRole('button', { name: 'Invita utente' }))
    await screen.findByRole('dialog', { name: 'Invita utente' })
    await expectNoA11yViolations(baseElement)
  })

  it('has no accessibility violations with the admin confirmation and the role dialog open', async () => {
    listing([managedUser({ role: 'admin', role_label: 'HR / Admin', name: 'Bruno Admin' }), managedUser({ id: 3, name: 'Anna Verdi', email: 'anna@holidays.test' })])
    const { user, baseElement } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Bruno Admin')
    await user.click(await screen.findByRole('menuitem', { name: 'Disattiva' }))
    await screen.findByRole('alertdialog', { name: 'Disattivare Bruno Admin?' })
    await expectNoA11yViolations(baseElement)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())

    await openMenu(user, 'Anna Verdi')
    await user.click(await screen.findByRole('menuitem', { name: 'Cambia ruolo' }))
    await screen.findByRole('dialog', { name: 'Cambia ruolo di Anna Verdi' })
    await expectNoA11yViolations(baseElement)
  })

  it('returns focus to the row menu after closing a dialog opened from it', async () => {
    listing([managedUser()])
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Disattiva' }))
    await screen.findByRole('alertdialog')
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Indietro' })).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    const trigger = within(screen.getByRole('table')).getByRole('button', { name: 'Azioni per Marco Bianchi' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(document.body.style.pointerEvents).not.toBe('none')
  })

  it('returns focus to the row menu after a successful role change', async () => {
    listing([managedUser()])
    server.use(http.patch('/api/users/2/role', () => HttpResponse.json({ data: managedUser({ role: 'manager' }) })))
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Cambia ruolo' }))
    const dialog = await screen.findByRole('dialog', { name: 'Cambia ruolo di Marco Bianchi' })
    await user.click(within(dialog).getByRole('radio', { name: 'Responsabile' }))
    await user.click(within(dialog).getByRole('button', { name: 'Salva ruolo' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const trigger = within(screen.getByRole('table')).getByRole('button', { name: 'Azioni per Marco Bianchi' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(document.body.style.pointerEvents).not.toBe('none')
  })

  it('moves focus to the page title when the cancelled invitation row disappears', async () => {
    let users = [managedUser({ status: 'invited', name: 'Luca Ferrari' })]
    server.use(
      http.get('/api/users', () => HttpResponse.json(userListResponse(users))),
      http.delete('/api/users/2/invitation', () => {
        users = []
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Luca Ferrari')
    await user.click(await screen.findByRole('menuitem', { name: 'Annulla invito' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Annulla invito di Luca Ferrari' }))

    expect(await screen.findByText('Invito annullato.')).toBeInTheDocument()
    await waitFor(() => expect(document.getElementById('page-title')).toHaveFocus())
    expect(document.body.style.pointerEvents).not.toBe('none')
  })

  it('returns focus to the row menu when it is closed without choosing', async () => {
    listing([managedUser()])
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await screen.findByRole('menuitem', { name: 'Disattiva' })
    await user.keyboard('{Escape}')

    const trigger = within(screen.getByRole('table')).getByRole('button', { name: 'Azioni per Marco Bianchi' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
