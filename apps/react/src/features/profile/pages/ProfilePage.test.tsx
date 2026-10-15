import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { User } from '@/features/auth/api'
import { routes } from '@/routes'
import { expectNoA11yViolations } from '@/test/axe'
import { expectBlockedButFocusable } from '@/test/blocked'
import { adminUser, currentUserResponse } from '@/test/fixtures'
import { historyEntry, historyPage } from '@/test/historyFixtures'
import { waitForStrayRequests } from '@/test/network'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const employee: User = {
  ...adminUser,
  id: 7,
  first_name: 'Marco',
  last_name: 'Bianchi',
  name: 'Marco Bianchi',
  email: 'marco@holidays.test',
  role: 'employee',
  role_label: 'Utente',
}

const signedIn = (user = employee) => server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(user))))

const openProfile = async () => {
  const view = renderRoutes(routes, ['/profile'], { toaster: false })
  await screen.findByRole('heading', { level: 1, name: 'Profilo' })
  return view
}

const card = (name: string): HTMLElement => {
  const heading = screen.getByRole('heading', { level: 2, name })
  const section = heading.closest('section')
  if (!section) throw new Error(`Blocco ${name} mancante`)
  return section
}

describe('ProfilePage', () => {
  it('opens from the account menu, before sign-out, for every role', async () => {
    signedIn()
    const { user, router } = renderRoutes(routes, ['/'], { toaster: false })

    await user.click(await screen.findByRole('button', { name: /Menu account/ }))
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(['Profilo', 'Esci'])
    await user.click(screen.getByRole('menuitem', { name: 'Profilo' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Profilo' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/profile')
    expect(document.title).toBe('Profilo · Holidays')
  })

  it('shows personal details, password and preferences', async () => {
    signedIn()
    await openProfile()

    const personal = card('Dati personali')
    expect(within(personal).getByLabelText('Nome')).toHaveValue('Marco')
    expect(within(personal).getByLabelText('Cognome')).toHaveValue('Bianchi')
    const email = within(personal).getByLabelText('Email')
    expect(email).toHaveValue('marco@holidays.test')
    expect(email).toHaveAttribute('readonly')
    expect(email).toHaveAccessibleDescription('L’email la cambia un amministratore.')
    expect(within(personal).getByLabelText('Ruolo')).toHaveValue('Utente')
    expect(within(personal).getByLabelText('Ruolo')).toHaveAttribute('readonly')

    const password = card('Password')
    expect(within(password).getByLabelText('Password attuale')).toHaveAttribute('autocomplete', 'current-password')
    expect(within(password).getByLabelText('Nuova password')).toHaveAttribute('autocomplete', 'new-password')
    expect(within(password).getByLabelText('Nuova password')).toHaveAccessibleDescription(/Almeno 12 caratteri/)
    expect(within(password).getByLabelText('Conferma la nuova password')).toHaveAttribute('autocomplete', 'new-password')

    const preferences = card('Preferenze')
    expect(within(preferences).getByRole('radio', { name: 'Italiano' })).toBeChecked()
    expect(within(preferences).getByRole('radio', { name: 'Sistema' })).toBeInTheDocument()
    expect(within(preferences).getByText('Vale per questo dispositivo.')).toBeInTheDocument()
  })

  it('saves the name and updates the account menu right away', async () => {
    signedIn()
    const bodies: unknown[] = []
    server.use(
      http.patch('/api/profile', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(currentUserResponse({ ...employee, last_name: 'Bianco', name: 'Marco Bianco' }))
      }),
    )
    const { user } = await openProfile()
    const personal = card('Dati personali')

    await user.clear(within(personal).getByLabelText('Cognome'))
    await user.type(within(personal).getByLabelText('Cognome'), '  Bianco ')
    await user.click(within(personal).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Dati salvati.')).toBeInTheDocument()
    expect(bodies).toEqual([{ first_name: 'Marco', last_name: 'Bianco' }])
    expect(screen.getByRole('button', { name: /Menu account/ })).toHaveTextContent('Marco Bianco')
  })

  it('saves the name once when two submits arrive in the same tick', async () => {
    signedIn()
    let saves = 0
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.patch('/api/profile', async () => {
        saves += 1
        // Risposta trattenuta: il secondo invio arriva mentre il primo salvataggio è in corso
        await gate
        return HttpResponse.json(currentUserResponse(employee))
      }),
    )
    await openProfile()
    const submit = within(card('Dati personali')).getByRole('button', { name: 'Salva' })
    const form = submit.closest('form')
    if (!form) throw new Error('Form dei dati personali mancante')

    // Due invii senza attese in mezzo: la validazione asincrona del primo non è ancora finita
    act(() => {
      fireEvent.submit(form)
      fireEvent.submit(form)
    })
    await waitForStrayRequests()
    expect(saves).toBe(1)
    expectBlockedButFocusable(submit)

    act(release)
    expect(await screen.findByText('Dati salvati.')).toBeInTheDocument()
  })

  it('shows the server message when saving the name is throttled', async () => {
    signedIn()
    server.use(http.patch('/api/profile', () => HttpResponse.json({ message: 'Troppe richieste. Riprova tra poco.' }, { status: 429, headers: { 'Retry-After': '30' } })))
    const { user } = await openProfile()

    await user.click(within(card('Dati personali')).getByRole('button', { name: 'Salva' }))

    expect(await screen.findByText('Troppe richieste. Riprova tra poco.')).toBeInTheDocument()
    expect(within(card('Dati personali')).getByLabelText('Nome')).toHaveValue('Marco')
  })

  it('puts the save buttons at the bottom of their card, as in the dialogs', async () => {
    signedIn()
    await openProfile()

    for (const [name, button] of [['Dati personali', 'Salva'], ['Password', 'Cambia password']]) {
      const footer = within(card(name)).getByRole('button', { name: button }).closest('[data-slot="card-footer"]')
      expect(footer, name).not.toBeNull()
    }
  })

  it('tells password managers which account the new password belongs to', async () => {
    signedIn()
    await openProfile()

    const form = within(card('Password')).getByLabelText('Nuova password').closest('form')
    const username = form?.querySelector('input[autocomplete="username"]')
    expect(username).toHaveValue('marco@holidays.test')
    expect(username).not.toBeVisible()
  })

  it('shows server errors under the name fields and focuses the first', async () => {
    signedIn()
    server.use(
      http.patch('/api/profile', () =>
        HttpResponse.json({ message: 'Dati non validi.', errors: { last_name: ['Il cognome è troppo lungo.'] } }, { status: 422 }),
      ),
    )
    const { user } = await openProfile()
    const personal = card('Dati personali')

    await user.click(within(personal).getByRole('button', { name: 'Salva' }))

    const lastName = within(personal).getByLabelText('Cognome')
    expect(await within(personal).findByText('Il cognome è troppo lungo.')).toBeInTheDocument()
    expect(lastName).toHaveAttribute('aria-invalid', 'true')
    expect(lastName).toHaveAccessibleDescription('Il cognome è troppo lungo.')
    await waitFor(() => expect(lastName).toHaveFocus())
  })

  it('requires first and last name before sending', async () => {
    signedIn()
    let saves = 0
    server.use(
      http.patch('/api/profile', () => {
        saves += 1
        return HttpResponse.json(currentUserResponse(employee))
      }),
    )
    const { user } = await openProfile()
    const personal = card('Dati personali')

    await user.clear(within(personal).getByLabelText('Nome'))
    await user.click(within(personal).getByRole('button', { name: 'Salva' }))

    expect(await within(personal).findByText('Inserisci il nome.')).toBeInTheDocument()
    await waitForStrayRequests()
    expect(saves).toBe(0)
  })

  it('changes the password once, confirms it and clears the fields', async () => {
    signedIn()
    const bodies: unknown[] = []
    server.use(
      http.put('/api/profile/password', async ({ request }) => {
        bodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user } = await openProfile()
    const password = card('Password')

    await user.type(within(password).getByLabelText('Password attuale'), 'holidays-dev-password')
    await user.type(within(password).getByLabelText('Nuova password'), 'una-nuova-password-lunga')
    await user.type(within(password).getByLabelText('Conferma la nuova password'), 'una-nuova-password-lunga')
    const submit = within(password).getByRole('button', { name: 'Cambia password' })
    await user.dblClick(submit)

    expect(await screen.findByText('Password cambiata. Le altre sessioni sono state chiuse.')).toBeInTheDocument()
    await waitForStrayRequests()
    expect(bodies).toEqual([
      { current_password: 'holidays-dev-password', password: 'una-nuova-password-lunga', password_confirmation: 'una-nuova-password-lunga' },
    ])
    expect(within(password).getByLabelText('Password attuale')).toHaveValue('')
    expect(within(password).getByLabelText('Nuova password')).toHaveValue('')
    expect(within(password).getByLabelText('Conferma la nuova password')).toHaveValue('')
  })

  it('checks length and confirmation before sending', async () => {
    signedIn()
    const { user } = await openProfile()
    const password = card('Password')

    await user.type(within(password).getByLabelText('Password attuale'), 'holidays-dev-password')
    await user.type(within(password).getByLabelText('Nuova password'), 'corta')
    await user.type(within(password).getByLabelText('Conferma la nuova password'), 'diversa')
    await user.click(within(password).getByRole('button', { name: 'Cambia password' }))

    expect(await within(password).findByText('La password deve avere almeno 12 caratteri.')).toBeInTheDocument()
    expect(within(password).getByText('Le due password non coincidono.')).toBeInTheDocument()
    await waitFor(() => expect(within(password).getByLabelText('Nuova password')).toHaveFocus())
  })

  it('shows a wrong current password under its field', async () => {
    signedIn()
    server.use(
      http.put('/api/profile/password', () =>
        HttpResponse.json({ message: 'Password errata.', errors: { current_password: ['La password non è corretta.'] } }, { status: 422 }),
      ),
    )
    const { user } = await openProfile()
    const password = card('Password')

    await user.type(within(password).getByLabelText('Password attuale'), 'sbagliata-sbagliata')
    await user.type(within(password).getByLabelText('Nuova password'), 'una-nuova-password-lunga')
    await user.type(within(password).getByLabelText('Conferma la nuova password'), 'una-nuova-password-lunga')
    await user.click(within(password).getByRole('button', { name: 'Cambia password' }))

    const current = within(password).getByLabelText('Password attuale')
    expect(await within(password).findByText('La password non è corretta.')).toBeInTheDocument()
    expect(current).toHaveAccessibleDescription('La password non è corretta.')
    await waitFor(() => expect(current).toHaveFocus())
  })

  it('blocks the button, still focusable, after too many attempts', async () => {
    signedIn()
    let attempts = 0
    server.use(
      http.put('/api/profile/password', () => {
        attempts += 1
        return HttpResponse.json({ message: 'Troppi tentativi. Riprova tra 15 minuti.' }, { status: 429, headers: { 'Retry-After': '900' } })
      }),
    )
    const { user } = await openProfile()
    const password = card('Password')

    await user.type(within(password).getByLabelText('Password attuale'), 'sbagliata-sbagliata')
    await user.type(within(password).getByLabelText('Nuova password'), 'una-nuova-password-lunga')
    await user.type(within(password).getByLabelText('Conferma la nuova password'), 'una-nuova-password-lunga')
    const submit = within(password).getByRole('button', { name: 'Cambia password' })
    await user.click(submit)

    expect(await within(password).findByText('Troppi tentativi. Riprova tra 15 minuti.')).toBeInTheDocument()
    expectBlockedButFocusable(submit)
    await user.click(submit)
    await waitForStrayRequests()
    expect(attempts).toBe(1)
  })

  it('saves the language on the account from the preferences', async () => {
    signedIn()
    const bodies: unknown[] = []
    server.use(
      http.patch('/api/profile', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(currentUserResponse({ ...employee, locale: 'en' }))
      }),
    )
    const { user } = await openProfile()

    await user.click(within(card('Preferenze')).getByRole('radio', { name: 'English' }))

    expect(await screen.findByText('Language saved.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument()
    expect(bodies).toEqual([{ locale: 'en' }])
  })

  it('applies the theme on this device only', async () => {
    signedIn()
    let saves = 0
    server.use(
      http.patch('/api/profile', () => {
        saves += 1
        return HttpResponse.json(currentUserResponse(employee))
      }),
    )
    const { user } = await openProfile()

    await user.click(within(card('Preferenze')).getByRole('radio', { name: 'Scuro' }))

    await waitFor(() => expect(document.documentElement).toHaveClass('dark'))
    await waitForStrayRequests()
    expect(saves).toBe(0)
  })

  it.each(['light', 'dark'])('has no accessibility violations (%s theme)', async (theme) => {
    signedIn()
    document.documentElement.className = theme
    const { container } = await openProfile()

    await expectNoA11yViolations(container)
  })
  it('shows employment type and, with more than one location, the location as read-only fields', async () => {
    const contractor: User = { ...employee, employment_type: 'contractor', employment_type_label: 'Collaboratore esterno', location: { id: 2, name: 'Bergamo' } }
    server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(contractor, { multipleLocations: true }))))
    await openProfile()

    const personal = card('Dati personali')
    expect(within(personal).getByLabelText('Tipo di rapporto')).toHaveValue('Collaboratore esterno')
    expect(within(personal).getByLabelText('Tipo di rapporto')).toHaveAttribute('readonly')
    expect(within(personal).getByLabelText('Sede')).toHaveValue('Bergamo')
  })

  it('hides the location when the company has only one', async () => {
    signedIn()
    await openProfile()

    expect(within(card('Dati personali')).queryByLabelText('Sede')).not.toBeInTheDocument()
    expect(within(card('Dati personali')).getByLabelText('Tipo di rapporto')).toHaveValue('Dipendente')
  })

  it('shows the last five steps of the account and the others on request', async () => {
    signedIn()
    const entries = Array.from({ length: 7 }, (_, index) =>
      historyEntry({ id: index + 1, summary: `Tappa ${index + 1}`, occurred_at: `2026-0${index + 1}-10T10:00:00+01:00` }),
    )
    server.use(http.get('/api/profile/history', () => HttpResponse.json(historyPage(entries))))
    const { user } = await openProfile()

    const history = card('Storico')
    expect(await within(history).findByText('Tappa 1')).toBeInTheDocument()
    expect(within(history).getAllByRole('listitem')).toHaveLength(5)
    expect(within(history).getByText('10 gennaio 2026')).toBeInTheDocument()

    await user.click(within(history).getByRole('button', { name: 'Mostra tutto' }))

    expect(within(history).getAllByRole('listitem')).toHaveLength(7)
    // Il pulsante sparisce: il focus va alla prima tappa comparsa, non si perde sul body
    await waitFor(() => expect(within(history).getByText('Tappa 6').closest('li')).toHaveFocus())
    expect(within(history).queryByRole('button', { name: 'Mostra tutto' })).not.toBeInTheDocument()
  })

  it('loads the next pages of the history', async () => {
    signedIn()
    const pages: string[] = []
    server.use(
      http.get('/api/profile/history', ({ request }) => {
        const page = new URL(request.url).searchParams.get('page') ?? '1'
        pages.push(page)
        const entries = page === '1' ? Array.from({ length: 20 }, (_, index) => historyEntry({ id: index + 1, summary: `Tappa ${index + 1}` })) : [historyEntry({ id: 21, summary: 'Tappa 21' })]
        return HttpResponse.json(historyPage(entries, { page: Number(page), lastPage: 2 }))
      }),
    )
    const { user } = await openProfile()

    const history = card('Storico')
    await within(history).findByText('Tappa 1')
    await user.click(within(history).getByRole('button', { name: 'Mostra tutto' }))
    await user.click(within(history).getByRole('button', { name: 'Carica altre' }))

    expect(await within(history).findByText('Tappa 21')).toBeInTheDocument()
    expect(pages).toEqual(['1', '2'])
    expect(within(history).queryByRole('button', { name: 'Carica altre' })).not.toBeInTheDocument()
  })

  it('says when there are no steps yet', async () => {
    signedIn()
    await openProfile()

    expect(await within(card('Storico')).findByText('Ancora nessuna tappa.')).toBeInTheDocument()
  })
})
