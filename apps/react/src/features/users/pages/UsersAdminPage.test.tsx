import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import ChangeRoleDialog from '@/features/users/components/ChangeRoleDialog'
import UsersAdminPage from '@/features/users/pages/UsersAdminPage'
import { expectNoA11yViolations } from '@/test/axe'
import { expectBlockedButFocusable } from '@/test/blocked'
import { holdDialogExitAnimation } from '@/test/dialogExit'
import { managedUser, NO_ACTIONS, userListResponse } from '@/test/usersFixtures'
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
    await user.type(within(dialog).getByLabelText('Nome'), 'Sara')
    await user.type(within(dialog).getByLabelText('Cognome'), 'Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.click(within(dialog).getByRole('button', { name: 'Invia invito' }))

    expect(await within(dialog).findByText('L’email è già in uso.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Email aziendale')).toHaveFocus()
    expect(body).toEqual({ first_name: 'Sara', last_name: 'Colombo', email: 'sara@holidays.test', role: 'employee' })
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
    await user.type(within(dialog).getByLabelText('Nome'), 'Sara')
    await user.type(within(dialog).getByLabelText('Cognome'), 'Colombo')
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
      await user.type(within(dialog).getByLabelText('Nome'), 'Sara')
    await user.type(within(dialog).getByLabelText('Cognome'), 'Colombo')
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

  it('shows only the actions the server allows on the row (can)', async () => {
    listing([managedUser({ name: 'Luca Ferrari', can: { ...NO_ACTIONS, disable: true } })])
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Luca Ferrari')

    expect(await screen.findByRole('menuitem', { name: 'Disattiva' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Cambia ruolo' })).not.toBeInTheDocument()
  })

  it('shows no menu on a row without allowed actions, like an admin seen by a manager', async () => {
    listing([managedUser({ id: 5, name: 'Bruno Admin', role: 'admin', role_label: 'HR / Admin', can: NO_ACTIONS }), managedUser()])
    renderRoutes(routes, ['/users'])

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Bruno')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Azioni per Bruno Admin' })).not.toBeInTheDocument()
    expect(within(table).getByRole('button', { name: 'Azioni per Marco Bianchi' })).toBeInTheDocument()
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
    // L'avviso va agli altri amministratori, mai a chi agisce
    expect(within(dialog).getByText('Gli altri amministratori riceveranno un’email.')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('La tua password'), 'sbagliata')
    await user.click(within(dialog).getByRole('button', { name: 'Disattiva Bruno Admin' }))

    expect(await within(dialog).findByText('La password non è corretta.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('La tua password')).toHaveFocus()
  })

  it('sends a password reset link to an active user after a confirmation, without a password', async () => {
    listing([managedUser()])
    const bodies: string[] = []
    server.use(
      http.post('/api/users/2/password-reset', async ({ request }) => {
        bodies.push(await request.text())
        return new HttpResponse(null, { status: 202 })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Invia reset password' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Inviare il link per reimpostare la password a Marco Bianchi?' })
    expect(
      within(dialog).getByText('Riceverà un’email a marco@holidays.test con un link valido 60 minuti. La password attuale resta valida finché non la cambia.'),
    ).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('La tua password')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Invia il link' }))

    expect(await screen.findByText('Link inviato a marco@holidays.test.')).toBeInTheDocument()
    // Nessun corpo: la password serve solo per un altro admin
    expect(bodies).toEqual([''])
  })

  it('offers the password reset only to active users the server allows', async () => {
    listing([
      managedUser(),
      managedUser({ id: 3, name: 'Luca Ferrari', email: 'luca@holidays.test', can: { ...NO_ACTIONS, disable: true } }),
      managedUser({ id: 4, name: 'Sara Colombo', email: 'sara@holidays.test', status: 'invited', status_label: 'Invitato' }),
    ])
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    expect((await screen.findAllByRole('menuitem')).map((item) => item.textContent)).toEqual(['Modifica', 'Cambia ruolo', 'Invia reset password', 'Disattiva'])
    await user.keyboard('{Escape}')
    await openMenu(user, 'Luca Ferrari')
    expect(await screen.findByRole('menuitem', { name: 'Disattiva' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Invia reset password' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await openMenu(user, 'Sara Colombo')
    expect(await screen.findByRole('menuitem', { name: 'Reinvia invito' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Invia reset password' })).not.toBeInTheDocument()
  })

  it.each([
    [429, 'Un link è stato inviato da poco a questo utente. Riprova tra 42 secondi.', { 'Retry-After': '42' }],
    [409, 'L’utente non è attivo.', {}],
  ])('shows the server message in a red toast on a %s for the password reset', async (status, message, headers) => {
    listing([managedUser()])
    server.use(http.post('/api/users/2/password-reset', () => HttpResponse.json({ message }, { status, headers })))
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Invia reset password' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Invia il link' }))

    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.queryByText(/Link inviato/)).not.toBeInTheDocument()
  })

  it('never sends the password reset twice while the confirmation is closing', async () => {
    holdDialogExitAnimation()
    listing([managedUser()])
    let calls = 0
    server.use(
      http.post('/api/users/2/password-reset', () => {
        calls += 1
        return new HttpResponse(null, { status: 202 })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Invia reset password' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Invia il link' }))
    expect(await screen.findByText('Link inviato a marco@holidays.test.')).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-state', 'closed')
    await user.keyboard('{Enter}')
    await waitForStrayRequests()

    expect(calls).toBe(1)
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
    await user.click(within(dialog).getByRole('radio', { name: 'Utente' }))
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
    await user.type(within(dialog).getByLabelText('Nome'), 'Sara')
    await user.type(within(dialog).getByLabelText('Cognome'), 'Colombo')
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

  it('offers "Modifica" only when the server allows it (can.update), on any status', async () => {
    listing([
      managedUser({ id: 2, name: 'Marco Bianchi', can: { ...NO_ACTIONS, update: true } }),
      managedUser({ id: 3, name: 'Luca Ferrari', email: 'luca@holidays.test', status: 'invited', can: { ...NO_ACTIONS, resend_invitation: true } }),
    ])
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    expect(await screen.findByRole('menuitem', { name: 'Modifica' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await openMenu(user, 'Luca Ferrari')
    expect(await screen.findByRole('menuitem', { name: 'Reinvia invito' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Modifica' })).not.toBeInTheDocument()
  })

  it('edits first and last name of an active user, with the email read-only and explained', async () => {
    listing([managedUser()])
    let body: unknown = null
    server.use(
      http.patch('/api/users/2', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser({ name: 'Marco Bianco' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Marco Bianchi' })
    expect(within(dialog).getByLabelText('Nome')).toHaveValue('Marco')
    const email = within(dialog).getByLabelText('Email aziendale')
    expect(email).toHaveValue('marco@holidays.test')
    expect(email).toHaveAttribute('readonly')
    expect(email).toHaveAccessibleDescription(/solo finché l’invito non è stato accettato/)
    await user.clear(within(dialog).getByLabelText('Cognome'))
    await user.type(within(dialog).getByLabelText('Cognome'), 'Bianco')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Dati di Marco Bianco aggiornati.')).toBeInTheDocument()
    expect(body).toEqual({ first_name: 'Marco', last_name: 'Bianco' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const trigger = within(screen.getByRole('table')).getByRole('button', { name: 'Azioni per Marco Bianchi' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('changes the email of an invited user and says the invitation goes to the new address', async () => {
    listing([managedUser({ name: 'Luca Ferrari', email: 'luca@holidays.test', status: 'invited', status_label: 'Invitato' })])
    let body: unknown = null
    server.use(
      http.patch('/api/users/2', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser({ name: 'Luca Ferrari', email: 'luca.ferrari@holidays.test', status: 'invited' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Luca Ferrari')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Luca Ferrari' })
    const email = within(dialog).getByLabelText('Email aziendale')
    expect(email).not.toHaveAttribute('readonly')
    expect(email).toHaveAccessibleDescription(/il link dell’invito viene inviato al nuovo indirizzo/)
    await user.clear(email)
    await user.type(email, 'luca.ferrari@holidays.test')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Dati aggiornati. Nuovo invito inviato a luca.ferrari@holidays.test.')).toBeInTheDocument()
    expect(body).toEqual({ first_name: 'Luca', last_name: 'Ferrari', email: 'luca.ferrari@holidays.test' })
  })

  it('validates the edit form and shows the server errors under the fields, focusing the first', async () => {
    listing([managedUser({ name: 'Luca Ferrari', status: 'invited' })])
    let calls = 0
    server.use(
      http.patch('/api/users/2', () => {
        calls += 1
        return HttpResponse.json({ message: 'x', errors: { email: ['L’email è già in uso.'] } }, { status: 422 })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Luca Ferrari')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Luca Ferrari' })
    await user.clear(within(dialog).getByLabelText('Nome'))
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))
    expect(await within(dialog).findByText('Inserisci il nome.')).toBeInTheDocument()
    expect(calls).toBe(0)

    await user.type(within(dialog).getByLabelText('Nome'), 'Luca')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))
    expect(await within(dialog).findByText('L’email è già in uso.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Email aziendale')).toHaveFocus()
  })

  it('keeps the save blocked but focusable after a 429', async () => {
    listing([managedUser()])
    let calls = 0
    server.use(
      http.patch('/api/users/2', () => {
        calls += 1
        return HttpResponse.json({ message: 'Troppe richieste. Riprova tra un minuto.' }, { status: 429, headers: { 'Retry-After': '60' } })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Marco Bianchi' })
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await within(dialog).findByText('Troppe richieste. Riprova tra un minuto.')).toBeInTheDocument()
    const button = within(dialog).getByRole('button', { name: 'Salva' })
    expectBlockedButFocusable(button)
    await user.click(button)
    await waitForStrayRequests()
    expect(calls).toBe(1)
  })

  it('never saves the edit twice while the dialog is closing', async () => {
    holdDialogExitAnimation()
    listing([managedUser()])
    let calls = 0
    server.use(
      http.patch('/api/users/2', () => {
        calls += 1
        return HttpResponse.json({ data: managedUser() })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Marco Bianchi' })
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))
    expect(await screen.findByText('Dati di Marco Bianchi aggiornati.')).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-state', 'closed')
    await user.keyboard('{Enter}')
    await waitForStrayRequests()

    expect(calls).toBe(1)
  })

  it('asks for your password to edit another admin and shows a wrong password under the field', async () => {
    listing([managedUser({ name: 'Bruno Admin', email: 'bruno@holidays.test', role: 'admin', role_label: 'HR / Admin' })])
    const bodies: unknown[] = []
    server.use(
      http.patch('/api/users/2', async ({ request }) => {
        bodies.push(await request.json())
        return bodies.length === 1
          ? HttpResponse.json({ message: 'x', errors: { current_password: ['La password non è corretta.'] } }, { status: 422 })
          : HttpResponse.json({ data: managedUser({ name: 'Bruno Admin', email: 'bruno@holidays.test', role: 'admin' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Bruno Admin')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Bruno Admin' })
    const password = within(dialog).getByLabelText('La tua password')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))
    expect(await within(dialog).findByText('Inserisci la password.')).toBeInTheDocument()
    expect(bodies).toHaveLength(0)

    await user.type(password, 'sbagliata')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))
    expect(await within(dialog).findByText('La password non è corretta.')).toBeInTheDocument()
    expect(password).toHaveFocus()

    await user.clear(password)
    await user.type(password, 'giusta')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))
    expect(await screen.findByText('Dati di Bruno Admin aggiornati.')).toBeInTheDocument()
    expect(bodies).toEqual([
      { first_name: 'Bruno', last_name: 'Admin', current_password: 'sbagliata' },
      { first_name: 'Bruno', last_name: 'Admin', current_password: 'giusta' },
    ])
  })

  it('keeps the edit of an admin blocked but focusable after too many wrong passwords', async () => {
    listing([managedUser({ name: 'Bruno Admin', role: 'admin', role_label: 'HR / Admin' })])
    let calls = 0
    server.use(
      http.patch('/api/users/2', () => {
        calls += 1
        return HttpResponse.json({ message: 'Troppi tentativi con la password. Riprova tra 15 minuti.' }, { status: 429, headers: { 'Retry-After': '900' } })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Bruno Admin')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Bruno Admin' })
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await within(dialog).findByText('Troppi tentativi con la password. Riprova tra 15 minuti.')).toBeInTheDocument()
    const button = within(dialog).getByRole('button', { name: 'Salva' })
    expectBlockedButFocusable(button)
    expect(button).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitForStrayRequests()
    expect(calls).toBe(1)
  })

  it('closes the edit with the server message when the person became an admin meanwhile (409)', async () => {
    listing([managedUser()])
    server.use(http.patch('/api/users/2', () => HttpResponse.json({ message: 'La situazione è cambiata: ricarica e riprova.' }, { status: 409 })))
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Marco Bianchi' })
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('La situazione è cambiata: ricarica e riprova.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not ask for the password to edit yourself or a non-admin', async () => {
    listing([
      managedUser({ id: 1, name: 'Anna Admin', email: 'anna@holidays.test', role: 'admin', is_current_user: true, can: { ...NO_ACTIONS, update: true } }),
      managedUser(),
    ])
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Anna Admin')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const own = await screen.findByRole('dialog', { name: 'Modifica Anna Admin' })
    expect(within(own).queryByLabelText('La tua password')).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const other = await screen.findByRole('dialog', { name: 'Modifica Marco Bianchi' })
    expect(within(other).queryByLabelText('La tua password')).not.toBeInTheDocument()
  })

  it('says a new invitation was sent only when the server changed the email', async () => {
    listing([managedUser({ name: 'Luca Ferrari', email: 'luca@holidays.test', status: 'invited', status_label: 'Invitato' })])
    // Il server normalizza l'email in minuscolo: per lui non è cambiata e non manda nessun invito
    server.use(http.patch('/api/users/2', () => HttpResponse.json({ data: managedUser({ name: 'Luca Ferrari', email: 'luca@holidays.test', status: 'invited' }) })))
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Luca Ferrari')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Luca Ferrari' })
    await user.clear(within(dialog).getByLabelText('Email aziendale'))
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'Luca@holidays.test')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Dati di Luca Ferrari aggiornati.')).toBeInTheDocument()
    expect(screen.queryByText(/Nuovo invito inviato/)).not.toBeInTheDocument()
  })

  it('neither validates nor sends the read-only email of a user who is not invited', async () => {
    listing([managedUser({ email: 'marco@vecchio' })])
    let body: unknown = null
    server.use(
      http.patch('/api/users/2', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser({ email: 'marco@vecchio' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Marco Bianchi' })
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Dati di Marco Bianchi aggiornati.')).toBeInTheDocument()
    expect(body).toEqual({ first_name: 'Marco', last_name: 'Bianchi' })
  })

  it.each([
    ['a network error', () => HttpResponse.error()],
    ['a server error', () => HttpResponse.json({ message: 'Server Error' }, { status: 500 })],
  ])('keeps the edit dialog open with the data after %s', async (_label, respond) => {
    listing([managedUser()])
    server.use(http.patch('/api/users/2', respond))
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Marco Bianchi' })
    await user.clear(within(dialog).getByLabelText('Cognome'))
    await user.type(within(dialog).getByLabelText('Cognome'), 'Bianco')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText(/Impossibile contattare il server|Qualcosa non ha funzionato/)).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Modifica Marco Bianchi' })).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Cognome')).toHaveValue('Bianco')
  })

  it('closes the edit dialog on a 403 and reloads the list', async () => {
    let listCalls = 0
    server.use(
      http.get('/api/users', () => {
        listCalls += 1
        return HttpResponse.json(userListResponse([managedUser()]))
      }),
      http.patch('/api/users/2', () => HttpResponse.json({ message: 'Non puoi modificare questo utente.' }, { status: 403 })),
    )
    const { user } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Marco Bianchi' })
    const before = listCalls
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Non puoi modificare questo utente.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(listCalls).toBeGreaterThan(before))
  })

  it('has no accessibility violations with the edit dialog open', async () => {
    listing([managedUser()])
    const { user, baseElement } = renderRoutes(routes, ['/users'])

    await openMenu(user, 'Marco Bianchi')
    await user.click(await screen.findByRole('menuitem', { name: 'Modifica' }))
    await screen.findByRole('dialog', { name: 'Modifica Marco Bianchi' })
    await expectNoA11yViolations(baseElement)
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
