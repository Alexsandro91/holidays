import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import AdministratorsPage from '@/features/administrators/pages/AdministratorsPage'
import { expectNoA11yViolations } from '@/test/axe'
import { holdDialogExitAnimation } from '@/test/dialogExit'
import { managedUser, NO_ACTIONS, userListResponse } from '@/test/usersFixtures'
import { expectBlockedButFocusable } from '@/test/blocked'
import { waitForStrayRequests } from '@/test/network'
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

  it('counts only active administrators for the only-you notice', async () => {
    admins([me, managedUser({ id: 4, name: 'Carla Admin', role: 'admin', role_label: 'HR / Admin', status: 'disabled', status_label: 'Disattivato' })])
    renderRoutes(routes, ['/admin/administrators'])

    expect(await screen.findByText(/Sei l’unico amministratore/)).toBeInTheDocument()
  })

  it('does not submit when Enter is pressed in the search field', async () => {
    admins()
    let posted = false
    server.use(
      http.get('/api/users', () => HttpResponse.json(userListResponse([managedUser({ id: 7, name: 'Marco Bianchi' })]))),
      http.post('/api/administrators', () => {
        posted = true
        return HttpResponse.json({ data: managedUser({ id: 7, role: 'admin' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    await user.click(await within(dialog).findByRole('radio', { name: /Marco Bianchi/ }))
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.type(within(dialog).getByRole('searchbox', { name: 'Cerca un utente attivo' }), 'Marco{Enter}')

    expect(within(dialog).queryByText('Scegli un utente.')).not.toBeInTheDocument()
    expect(screen.queryByText('Marco Bianchi ora è amministratore.')).not.toBeInTheDocument()
    expect(posted).toBe(false)
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

  it('never promotes twice while the dialog is closing', async () => {
    holdDialogExitAnimation()
    admins()
    let calls = 0
    server.use(
      http.get('/api/users', () => HttpResponse.json(userListResponse([managedUser({ id: 7, name: 'Marco Bianchi' })]))),
      http.post('/api/administrators', () => {
        calls += 1
        return HttpResponse.json({ data: managedUser({ id: 7, name: 'Marco Bianchi', role: 'admin' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    await user.click(await within(dialog).findByRole('radio', { name: /Marco Bianchi/ }))
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Rendi amministratore' }))
    expect(await screen.findByText('Marco Bianchi ora è amministratore.')).toBeInTheDocument()
    // Durante l'animazione di chiusura il form è ancora lì: un Invio non deve ripetere la promozione
    expect(dialog).toHaveAttribute('data-state', 'closed')
    await user.keyboard('{Enter}')
    await waitForStrayRequests()

    expect(calls).toBe(1)
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

  it('never revokes twice while the dialog is closing', async () => {
    holdDialogExitAnimation()
    admins()
    let calls = 0
    server.use(
      http.delete('/api/administrators/3', () => {
        calls += 1
        return HttpResponse.json({ data: managedUser({ id: 3, name: 'Bruno Admin', role: 'employee' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Revoca Bruno Admin' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Revocare il ruolo di amministratore a Bruno Admin?' })
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Revoca Bruno Admin' }))
    expect(await screen.findByText('Bruno Admin non è più amministratore.')).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-state', 'closed')
    await user.keyboard('{Enter}')
    await waitForStrayRequests()

    expect(calls).toBe(1)
  })

  it('accepts a new revoke when the dialog is reopened before the closing animation ends', async () => {
    holdDialogExitAnimation()
    admins()
    let calls = 0
    server.use(
      http.delete('/api/administrators/3', () => {
        calls += 1
        return HttpResponse.json({ data: managedUser({ id: 3, name: 'Bruno Admin', role: 'employee' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Revoca Bruno Admin' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Revocare il ruolo di amministratore a Bruno Admin?' })
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Revoca Bruno Admin' }))
    await screen.findByText('Bruno Admin non è più amministratore.')
    // Guardia: il dialog deve essere ancora nel DOM in chiusura, altrimenti il test non prova la riapertura in animazione
    expect(dialog).toHaveAttribute('data-state', 'closed')
    // Riapertura mentre il dialog si sta ancora chiudendo: la pagina sotto è ancora nascosta e senza puntatore
    const pageButton = screen.getAllByRole('button', { name: 'Revoca Bruno Admin', hidden: true }).find((button) => !dialog.contains(button))
    if (!pageButton) throw new Error('Pulsante di revoca della pagina mancante')
    fireEvent.click(pageButton)
    await waitFor(() => expect(dialog).toHaveAttribute('data-state', 'open'))
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Revoca Bruno Admin' }))

    await waitFor(() => expect(calls).toBe(2))
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
    const button = within(dialog).getByRole('button', { name: 'Revoca Bruno Admin' })
    expectBlockedButFocusable(button)
    expect(button).toHaveFocus()

    // Bloccato: anche con la password cancellata l'Invio sul pulsante non valida il form e non sposta il focus
    await user.clear(within(dialog).getByLabelText('La tua password'))
    act(() => button.focus())
    await user.keyboard('{Enter}')
    expect(button).toHaveFocus()
  })

  it('keeps the focus on the promote button after too many wrong passwords', async () => {
    admins()
    let calls = 0
    server.use(
      http.get('/api/users', () => HttpResponse.json(userListResponse([managedUser({ id: 7, name: 'Marco Bianchi' })]))),
      http.post('/api/administrators', () => {
        calls += 1
        return HttpResponse.json({ message: 'Troppi tentativi con la password. Riprova tra 15 minuti.' }, { status: 429, headers: { 'Retry-After': '900' } })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    await user.click(await within(dialog).findByRole('radio', { name: /Marco Bianchi/ }))
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Rendi amministratore' }))

    expect(await within(dialog).findByText('Troppi tentativi con la password. Riprova tra 15 minuti.')).toBeInTheDocument()
    const button = within(dialog).getByRole('button', { name: 'Rendi amministratore' })
    expectBlockedButFocusable(button)
    expect(button).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(calls).toBe(1)
  })

  it('shows both the missing user and missing password errors', async () => {
    admins()
    server.use(http.get('/api/users', () => HttpResponse.json(userListResponse([managedUser({ id: 7 })]))))
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    await user.click(within(dialog).getByRole('button', { name: 'Rendi amministratore' }))

    expect(await within(dialog).findByText('Scegli un utente.')).toBeInTheDocument()
    expect(within(dialog).getByText('Inserisci la password.')).toBeInTheDocument()
  })

  it('refetches the candidates after a 409 on promotion', async () => {
    admins()
    let usersCalls = 0
    server.use(
      http.get('/api/users', () => {
        usersCalls += 1
        return HttpResponse.json(userListResponse([managedUser({ id: 7, name: 'Marco Bianchi' })]))
      }),
      http.post('/api/administrators', () => HttpResponse.json({ message: 'Già amministratore.' }, { status: 409 })),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    await user.click(await within(dialog).findByRole('radio', { name: /Marco Bianchi/ }))
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    const before = usersCalls
    await user.click(within(dialog).getByRole('button', { name: 'Rendi amministratore' }))

    expect(await screen.findByText('Già amministratore.')).toBeInTheDocument()
    await waitFor(() => expect(usersCalls).toBeGreaterThan(before))
  })

  it('refetches the administrators after a 409 on revoke', async () => {
    let listCalls = 0
    server.use(
      http.get('/api/administrators', () => {
        listCalls += 1
        return HttpResponse.json({ data: [me, bruno] })
      }),
      http.delete('/api/administrators/3', () => HttpResponse.json({ message: 'Non più amministratore.' }, { status: 409 })),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Revoca Bruno Admin' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    const before = listCalls
    await user.click(within(dialog).getByRole('button', { name: 'Revoca Bruno Admin' }))

    expect(await screen.findByText('Non più amministratore.')).toBeInTheDocument()
    await waitFor(() => expect(listCalls).toBeGreaterThan(before))
  })

  it('does not close the grant dialog while the request is pending', async () => {
    admins()
    server.use(
      http.get('/api/users', () => HttpResponse.json(userListResponse([managedUser({ id: 7, name: 'Marco Bianchi' })]))),
      http.post('/api/administrators', async () => {
        await delay(300)
        return HttpResponse.json({ data: managedUser({ id: 7, role: 'admin' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    await user.click(await within(dialog).findByRole('radio', { name: /Marco Bianchi/ }))
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Rendi amministratore' }))
    await user.keyboard('{Escape}')

    expect(screen.getByRole('dialog', { name: 'Aggiungi un amministratore' })).toBeInTheDocument()
    expect(await screen.findByText('Marco Bianchi ora è amministratore.')).toBeInTheDocument()
  })

  it('clears the selection when a new search removes the chosen user', async () => {
    admins()
    server.use(
      http.get('/api/users', ({ request }) => {
        const search = new URL(request.url).searchParams.get('filter[search]')
        return HttpResponse.json(userListResponse(search ? [managedUser({ id: 8, name: 'Laura Verdi' })] : [managedUser({ id: 7, name: 'Marco Bianchi' })]))
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    await user.click(await within(dialog).findByRole('radio', { name: /Marco Bianchi/ }))
    await user.type(within(dialog).getByRole('searchbox', { name: 'Cerca un utente attivo' }), 'lau')
    const laura = await within(dialog).findByRole('radio', { name: /Laura Verdi/ })
    expect(laura).not.toBeChecked()
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Rendi amministratore' }))

    expect(await within(dialog).findByText('Scegli un utente.')).toBeInTheDocument()
  })

  it('searches the candidates with the general search (first name, last name or email)', async () => {
    admins()
    const urls: URL[] = []
    server.use(
      http.get('/api/users', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json(userListResponse([managedUser({ id: 7, name: 'Marco Bianchi' })]))
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    const search = within(dialog).getByRole('searchbox', { name: 'Cerca un utente attivo' })
    expect(search).toHaveAttribute('maxLength', '100')
    await user.type(search, 'bianchi marco')

    await waitFor(() => expect(urls.at(-1)?.searchParams.get('filter[search]')).toBe('bianchi marco'))
    expect(urls.at(-1)?.searchParams.get('filter[status]')).toBe('active')
  })

  it('shows a load error of the candidates instead of "no results"', async () => {
    admins()
    server.use(http.get('/api/users', () => HttpResponse.json({ message: 'x' }, { status: 422 })))
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })

    expect(await within(dialog).findByText('Non è stato possibile caricare gli utenti.')).toBeInTheDocument()
    expect(within(dialog).queryByText('Nessun utente attivo trovato.')).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Riprova' })).toBeInTheDocument()
  })

  const openNewPerson = async (user: ReturnType<typeof renderRoutes>['user']) => {
    await user.click(await screen.findByRole('button', { name: 'Aggiungi admin' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aggiungi un amministratore' })
    expect(within(dialog).getByRole('radio', { name: 'Utente esistente' })).toBeChecked()
    await user.click(within(dialog).getByRole('radio', { name: 'Nuova persona' }))
    return dialog
  }

  it('invites a new person as administrator with your password', async () => {
    admins()
    server.use(http.get('/api/users', () => HttpResponse.json(userListResponse([]))))
    let body: unknown = null
    server.use(
      http.post('/api/administrators/invitations', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser({ id: 9, name: 'Sara Colombo', email: 'sara@holidays.test', role: 'admin', status: 'invited' }) }, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    const dialog = await openNewPerson(user)
    expect(within(dialog).queryByRole('searchbox')).not.toBeInTheDocument()
    await user.type(within(dialog).getByLabelText('Nome'), 'Sara')
    await user.type(within(dialog).getByLabelText('Cognome'), 'Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Invita amministratore' }))

    expect(await screen.findByText('Invito da amministratore inviato a sara@holidays.test.')).toBeInTheDocument()
    expect(body).toEqual({ first_name: 'Sara', last_name: 'Colombo', email: 'sara@holidays.test', current_password: 'password' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('validates name, email and password of the new person before sending', async () => {
    admins()
    server.use(http.get('/api/users', () => HttpResponse.json(userListResponse([]))))
    let posted = false
    server.use(
      http.post('/api/administrators/invitations', () => {
        posted = true
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    const dialog = await openNewPerson(user)
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'non-valida')
    await user.click(within(dialog).getByRole('button', { name: 'Invita amministratore' }))

    expect(await within(dialog).findByText('Inserisci il nome.')).toBeInTheDocument()
    expect(within(dialog).getByText('Inserisci il cognome.')).toBeInTheDocument()
    expect(within(dialog).getByText('Inserisci un indirizzo email valido, ad esempio nome@azienda.it.')).toBeInTheDocument()
    expect(within(dialog).getByText('Inserisci la password.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Nome')).toHaveFocus()
    expect(posted).toBe(false)
  })

  it('shows the server errors of the new person under the fields, focusing the first', async () => {
    admins()
    server.use(
      http.get('/api/users', () => HttpResponse.json(userListResponse([]))),
      http.post('/api/administrators/invitations', () =>
        HttpResponse.json({ message: 'x', errors: { email: ['L’email è già in uso.'], current_password: ['La password non è corretta.'] } }, { status: 422 }),
      ),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    const dialog = await openNewPerson(user)
    await user.type(within(dialog).getByLabelText('Nome'), 'Sara')
    await user.type(within(dialog).getByLabelText('Cognome'), 'Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.type(within(dialog).getByLabelText('La tua password'), 'sbagliata')
    await user.click(within(dialog).getByRole('button', { name: 'Invita amministratore' }))

    expect(await within(dialog).findByText('L’email è già in uso.')).toBeInTheDocument()
    expect(within(dialog).getByText('La password non è corretta.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Email aziendale')).toHaveFocus()
  })

  it('keeps the invite blocked but focusable after too many wrong passwords', async () => {
    admins()
    let calls = 0
    server.use(
      http.get('/api/users', () => HttpResponse.json(userListResponse([]))),
      http.post('/api/administrators/invitations', () => {
        calls += 1
        return HttpResponse.json({ message: 'Troppi tentativi con la password. Riprova tra 15 minuti.' }, { status: 429, headers: { 'Retry-After': '900' } })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    const dialog = await openNewPerson(user)
    await user.type(within(dialog).getByLabelText('Nome'), 'Sara')
    await user.type(within(dialog).getByLabelText('Cognome'), 'Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Invita amministratore' }))

    expect(await within(dialog).findByText('Troppi tentativi con la password. Riprova tra 15 minuti.')).toBeInTheDocument()
    const button = within(dialog).getByRole('button', { name: 'Invita amministratore' })
    expectBlockedButFocusable(button)
    expect(button).toHaveFocus()
    await user.keyboard('{Enter}')
    await waitForStrayRequests()
    expect(calls).toBe(1)
  })

  it('names the mode radio group and blocks it while sending', async () => {
    admins()
    server.use(
      http.get('/api/users', () => HttpResponse.json(userListResponse([]))),
      http.post('/api/administrators/invitations', async () => {
        await delay('infinite')
        return HttpResponse.json({}, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    const dialog = await openNewPerson(user)
    const modes = within(dialog).getByRole('radiogroup', { name: 'Chi vuoi aggiungere' })
    await user.type(within(dialog).getByLabelText('Nome'), 'Sara')
    await user.type(within(dialog).getByLabelText('Cognome'), 'Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Invita amministratore' }))

    await waitFor(() => expect(within(modes).getByRole('radio', { name: 'Utente esistente' })).toBeDisabled())
  })

  it('keeps the lockout after a 429 when switching mode', async () => {
    admins()
    server.use(
      http.get('/api/users', () => HttpResponse.json(userListResponse([managedUser({ id: 7, name: 'Marco Bianchi' })]))),
      http.post('/api/administrators/invitations', () =>
        HttpResponse.json({ message: 'Troppi tentativi con la password. Riprova tra 15 minuti.' }, { status: 429, headers: { 'Retry-After': '900' } }),
      ),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    const dialog = await openNewPerson(user)
    await user.type(within(dialog).getByLabelText('Nome'), 'Sara')
    await user.type(within(dialog).getByLabelText('Cognome'), 'Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Invita amministratore' }))
    await within(dialog).findByText('Troppi tentativi con la password. Riprova tra 15 minuti.')

    await user.click(within(dialog).getByRole('radio', { name: 'Utente esistente' }))
    expect(within(dialog).getByText('Troppi tentativi con la password. Riprova tra 15 minuti.')).toBeInTheDocument()
    expectBlockedButFocusable(within(dialog).getByRole('button', { name: 'Rendi amministratore' }))
    await user.click(within(dialog).getByRole('radio', { name: 'Nuova persona' }))
    expectBlockedButFocusable(within(dialog).getByRole('button', { name: 'Invita amministratore' }))
  })

  it('never invites twice while the dialog is closing', async () => {
    holdDialogExitAnimation()
    admins()
    let calls = 0
    server.use(
      http.get('/api/users', () => HttpResponse.json(userListResponse([]))),
      http.post('/api/administrators/invitations', () => {
        calls += 1
        return HttpResponse.json({ data: managedUser({ id: 9, role: 'admin', status: 'invited' }) }, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    const dialog = await openNewPerson(user)
    await user.type(within(dialog).getByLabelText('Nome'), 'Sara')
    await user.type(within(dialog).getByLabelText('Cognome'), 'Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Invita amministratore' }))
    expect(await screen.findByText('Invito da amministratore inviato a sara@holidays.test.')).toBeInTheDocument()
    expect(dialog).toHaveAttribute('data-state', 'closed')
    await user.keyboard('{Enter}')
    await waitForStrayRequests()

    expect(calls).toBe(1)
  })

  it('does not close the dialog while the invitation is being sent', async () => {
    admins()
    server.use(
      http.get('/api/users', () => HttpResponse.json(userListResponse([]))),
      http.post('/api/administrators/invitations', async () => {
        await delay(300)
        return HttpResponse.json({ data: managedUser({ id: 9, role: 'admin', status: 'invited' }) }, { status: 201 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    const dialog = await openNewPerson(user)
    await user.type(within(dialog).getByLabelText('Nome'), 'Sara')
    await user.type(within(dialog).getByLabelText('Cognome'), 'Colombo')
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara@holidays.test')
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Invita amministratore' }))
    await user.keyboard('{Escape}')

    expect(screen.getByRole('dialog', { name: 'Aggiungi un amministratore' })).toBeInTheDocument()
    expect(await screen.findByText('Invito da amministratore inviato a sara@holidays.test.')).toBeInTheDocument()
  })

  it('shows invited administrators with the expiry, resend, edit and cancel instead of revoke', async () => {
    const invited = managedUser({ id: 6, name: 'Sara Colombo', role: 'admin', role_label: 'HR / Admin', status: 'invited', status_label: 'Invitato', invitation_expires_at: '2099-10-16T10:00:00+00:00' })
    admins([me, bruno, invited])
    renderRoutes(routes, ['/admin/administrators'])

    const row = (await screen.findByText('Sara Colombo')).closest('li')
    if (!row) throw new Error('Riga di Sara Colombo mancante')
    expect(within(row).getByText('Invitato')).toBeInTheDocument()
    expect(within(row).getByText(/Invito scade il/)).toBeInTheDocument()
    expect(within(row).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Reinvia invito a Sara Colombo',
      'Modifica Sara Colombo',
      'Annulla invito di Sara Colombo',
    ])
  })

  it('offers revoke only on active administrators (the server answers 409 otherwise)', async () => {
    admins([me, bruno, managedUser({ id: 4, name: 'Carla Admin', role: 'admin', status: 'disabled', status_label: 'Disattivato' })])
    renderRoutes(routes, ['/admin/administrators'])

    expect(await screen.findByRole('button', { name: 'Revoca Bruno Admin' })).toBeInTheDocument()
    expect(screen.getByText('Carla Admin')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revoca Carla Admin' })).not.toBeInTheDocument()
  })

  it('disables an active administrator with your password, keeping the role and the row', async () => {
    admins()
    let body: unknown = null
    server.use(
      http.post('/api/users/3/disable', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: { ...bruno, status: 'disabled', status_label: 'Disattivato' } })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    const trigger = await screen.findByRole('button', { name: 'Disattiva Bruno Admin' })
    await user.click(trigger)
    const dialog = await screen.findByRole('alertdialog', { name: 'Disattivare Bruno Admin?' })
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Disattiva Bruno Admin' }))

    expect(await screen.findByText('Bruno Admin è stato disattivato.')).toBeInTheDocument()
    expect(body).toEqual({ current_password: 'password' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('shows a wrong password under the field when disabling an administrator', async () => {
    admins()
    server.use(http.post('/api/users/3/disable', () => HttpResponse.json({ message: 'Errore', errors: { current_password: ['La password non è corretta.'] } }, { status: 422 })))
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Disattiva Bruno Admin' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Disattivare Bruno Admin?' })
    await user.type(within(dialog).getByLabelText('La tua password'), 'sbagliata')
    await user.click(within(dialog).getByRole('button', { name: 'Disattiva Bruno Admin' }))

    expect(await within(dialog).findByText('La password non è corretta.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('La tua password')).toHaveFocus()
  })

  it('re-enables a disabled administrator with your password', async () => {
    const carla = managedUser({ id: 4, name: 'Carla Admin', role: 'admin', role_label: 'HR / Admin', status: 'disabled', status_label: 'Disattivato' })
    admins([me, carla])
    let body: unknown = null
    server.use(
      http.post('/api/users/4/enable', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: { ...carla, status: 'active', status_label: 'Attivo' } })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Riattiva Carla Admin' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Riattivare Carla Admin?' })
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Riattiva Carla Admin' }))

    expect(await screen.findByText('Carla Admin è stato riattivato.')).toBeInTheDocument()
    expect(body).toEqual({ current_password: 'password' })
  })

  it('offers disable and enable only where the server allows them, never on yourself', async () => {
    admins([
      me,
      managedUser({ id: 3, name: 'Bruno Admin', role: 'admin', can: { ...NO_ACTIONS, update: true } }),
      managedUser({ id: 4, name: 'Carla Admin', role: 'admin', status: 'disabled', status_label: 'Disattivato', can: NO_ACTIONS }),
    ])
    renderRoutes(routes, ['/admin/administrators'])

    expect(await screen.findByRole('button', { name: 'Revoca Bruno Admin' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Disattiva Bruno Admin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Riattiva Carla Admin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Disattiva Anna Admin' })).not.toBeInTheDocument()
  })

  it('returns the focus to "Annulla invito" when its dialog is closed without cancelling', async () => {
    admins([me, managedUser({ id: 6, name: 'Sara Colombo', role: 'admin', status: 'invited', status_label: 'Invitato' })])
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    const trigger = await screen.findByRole('button', { name: 'Annulla invito di Sara Colombo' })
    await user.click(trigger)
    await screen.findByRole('alertdialog')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('edits an invited administrator and returns the focus to "Modifica"', async () => {
    admins([me, managedUser({ id: 6, name: 'Sara Colombo', email: 'sara@holidays.test', role: 'admin', status: 'invited', status_label: 'Invitato' })])
    let body: unknown = null
    server.use(
      http.patch('/api/users/6', async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ data: managedUser({ id: 6, name: 'Sara Colombo', email: 'sara.colombo@holidays.test', role: 'admin', status: 'invited' }) })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    const trigger = await screen.findByRole('button', { name: 'Modifica Sara Colombo' })
    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Modifica Sara Colombo' })
    await user.clear(within(dialog).getByLabelText('Email aziendale'))
    await user.type(within(dialog).getByLabelText('Email aziendale'), 'sara.colombo@holidays.test')
    // È un altro admin: serve la password di chi agisce
    await user.type(within(dialog).getByLabelText('La tua password'), 'password')
    await user.click(within(dialog).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Dati aggiornati. Nuovo invito inviato a sara.colombo@holidays.test.')).toBeInTheDocument()
    expect(body).toEqual({ first_name: 'Sara', last_name: 'Colombo', email: 'sara.colombo@holidays.test', current_password: 'password' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('hides resend and cancel when the server does not allow them', async () => {
    const invited = managedUser({ id: 6, name: 'Sara Colombo', role: 'admin', status: 'invited', status_label: 'Invitato', can: { ...NO_ACTIONS, cancel_invitation: true } })
    admins([me, invited])
    renderRoutes(routes, ['/admin/administrators'])

    await screen.findByText('Sara Colombo')
    expect(screen.queryByRole('button', { name: 'Reinvia invito a Sara Colombo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Modifica Sara Colombo' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annulla invito di Sara Colombo' })).toBeInTheDocument()
  })

  it('resends the invitation of an invited administrator after a confirmation', async () => {
    const invited = managedUser({ id: 6, name: 'Sara Colombo', role: 'admin', status: 'invited', status_label: 'Invitato' })
    admins([me, invited])
    let called = false
    server.use(
      http.post('/api/users/6/invitation', () => {
        called = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    const trigger = await screen.findByRole('button', { name: 'Reinvia invito a Sara Colombo' })
    await user.click(trigger)
    const dialog = await screen.findByRole('alertdialog', { name: 'Reinviare l’invito a Sara Colombo?' })
    await user.click(within(dialog).getByRole('button', { name: 'Reinvia' }))

    expect(await screen.findByText('Invito inviato di nuovo.')).toBeInTheDocument()
    expect(called).toBe(true)
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('cancels the invitation of an invited administrator', async () => {
    let list = [me, managedUser({ id: 6, name: 'Sara Colombo', role: 'admin', status: 'invited', status_label: 'Invitato' })]
    server.use(
      http.get('/api/administrators', () => HttpResponse.json({ data: list })),
      http.delete('/api/users/6/invitation', () => {
        list = [me]
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user } = renderRoutes(routes, ['/admin/administrators'])

    await user.click(await screen.findByRole('button', { name: 'Annulla invito di Sara Colombo' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Annullare l’invito di Sara Colombo?' })
    await user.click(within(dialog).getByRole('button', { name: 'Annulla invito di Sara Colombo' }))

    expect(await screen.findByText('Invito annullato.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Sara Colombo')).not.toBeInTheDocument())
    await waitFor(() => expect(document.getElementById('page-title')).toHaveFocus())
  })

  it('has no accessibility violations with the new person form open', async () => {
    admins()
    server.use(http.get('/api/users', () => HttpResponse.json(userListResponse([]))))
    const { user, baseElement } = renderRoutes(routes, ['/admin/administrators'])

    await openNewPerson(user)
    await expectNoA11yViolations(baseElement)
  })

  it('has no accessibility violations', async () => {
    admins()
    const { container } = renderRoutes(routes, ['/admin/administrators'])

    await screen.findByText('Bruno Admin')
    await expectNoA11yViolations(container)
  })
})
