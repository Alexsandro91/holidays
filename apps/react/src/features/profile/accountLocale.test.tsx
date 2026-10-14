import { act, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import i18n from '@/lib/i18n'
import { userQueryKey } from '@/lib/queryKeys'
import { routes } from '@/routes'
import { adminUser, currentUserResponse } from '@/test/fixtures'
import { waitForStrayRequests } from '@/test/network'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const signedIn = (locale: 'it' | 'en' = 'it') => server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse({ ...adminUser, locale }))))

describe('account language', () => {
  it('switches to the account language on load and remembers it in the browser', async () => {
    signedIn('en')
    renderRoutes(routes, ['/'], { toaster: false })

    expect(await screen.findByRole('heading', { level: 1, name: 'Hi, Giulia' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
    expect(window.localStorage.getItem('holidays-locale')).toBe('en')
  })

  it('switches to the account language after the sign-in code', async () => {
    // Prima del codice nessuna sessione; dopo, la rilettura dell'utente con i limiti della sessione
    let signedInAfterCode = false
    server.use(
      http.post('/api/auth/two-factor', () => {
        signedInAfterCode = true
        return HttpResponse.json({ data: { ...adminUser, locale: 'en' } })
      }),
      http.get('/api/auth/user', () =>
        signedInAfterCode
          ? HttpResponse.json(currentUserResponse({ ...adminUser, locale: 'en' }))
          : HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 }),
      ),
    )
    const { user } = renderRoutes(routes, [{ pathname: '/login/verify', state: { email: 'admin@holidays.test' } }], { toaster: false })

    await user.type(await screen.findByLabelText('Codice di verifica'), '482913')

    expect(await screen.findByRole('heading', { level: 1, name: 'Hi, Giulia' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })

  it('saves the language chosen in the top bar on the account', async () => {
    signedIn('it')
    const bodies: unknown[] = []
    server.use(
      http.patch('/api/profile', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json(currentUserResponse({ ...adminUser, locale: 'en' }))
      }),
    )
    const { user } = renderRoutes(routes, ['/'], { toaster: false })
    await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })

    await user.click(screen.getByRole('button', { name: 'Lingua: Italiano' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Hi, Giulia' })).toBeInTheDocument()
    await waitFor(() => expect(bodies).toEqual([{ locale: 'en' }]))
    await waitForStrayRequests()
    // La lingua resta quella scelta: la risposta non la riporta indietro
    expect(i18n.language).toBe('en')
  })

  it('keeps the chosen language and shows an error when saving it fails', async () => {
    signedIn('it')
    server.use(http.patch('/api/profile', () => HttpResponse.json({ message: 'Server Error' }, { status: 500 })))
    const { user } = renderRoutes(routes, ['/'], { toaster: false })
    await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })

    await user.click(screen.getByRole('button', { name: 'Lingua: Italiano' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))

    expect(await screen.findByText('The language was not saved to your account. Please try again.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Hi, Giulia' })).toBeInTheDocument()
    expect(i18n.language).toBe('en')
  })

  it('keeps the browser language for guests, without saving it', async () => {
    let saves = 0
    server.use(
      http.patch('/api/profile', () => {
        saves += 1
        return HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })
      }),
    )
    const { user } = renderRoutes(routes, ['/login'], { toaster: false })
    await screen.findByRole('heading', { level: 1, name: 'Accedi' })

    await user.click(screen.getByRole('button', { name: 'Lingua: Italiano' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    await waitForStrayRequests()
    expect(saves).toBe(0)
    expect(window.localStorage.getItem('holidays-locale')).toBe('en')
  })

  it('applies the account language once per session: a later reread does not bring it back', async () => {
    signedIn('it')
    server.use(http.patch('/api/profile', () => HttpResponse.json({ message: 'Server Error' }, { status: 500 })))
    const { user, queryClient } = renderRoutes(routes, ['/'], { toaster: false })
    await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })

    await user.click(screen.getByRole('button', { name: 'Lingua: Italiano' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))
    expect(await screen.findByText('The language was not saved to your account. Please try again.')).toBeInTheDocument()

    // Rilettura dell'utente (focus della finestra, Resta collegato…): l'account dice ancora italiano
    await act(() => queryClient.refetchQueries({ queryKey: userQueryKey }))
    await waitForStrayRequests()

    expect(i18n.language).toBe('en')
    expect(screen.getByRole('heading', { level: 1, name: 'Hi, Giulia' })).toBeInTheDocument()
  })

  it('does not go back when a reread answers while the save is still in progress', async () => {
    signedIn('it')
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.patch('/api/profile', async () => {
        await gate
        return HttpResponse.json(currentUserResponse({ ...adminUser, locale: 'en' }))
      }),
    )
    const { user, queryClient } = renderRoutes(routes, ['/'], { toaster: false })
    await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })

    await user.click(screen.getByRole('button', { name: 'Lingua: Italiano' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))
    await act(() => queryClient.refetchQueries({ queryKey: userQueryKey }))
    act(release)
    await waitForStrayRequests()

    expect(i18n.language).toBe('en')
  })

  it('sends quick language changes one after the other, so the last choice wins on the account', async () => {
    signedIn('it')
    const received: unknown[] = []
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.patch('/api/profile', async ({ request }) => {
        const body: unknown = await request.json()
        received.push(body)
        if (received.length === 1) await gate
        return HttpResponse.json(currentUserResponse(adminUser))
      }),
    )
    const { user } = renderRoutes(routes, ['/'], { toaster: false })
    await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })

    await user.click(screen.getByRole('button', { name: 'Lingua: Italiano' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))
    await user.click(screen.getByRole('button', { name: 'Language: English' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'Italiano' }))
    await waitForStrayRequests()
    // Il secondo PATCH parte solo dopo la risposta al primo
    expect(received).toEqual([{ locale: 'en' }])

    act(release)
    await waitFor(() => expect(received).toEqual([{ locale: 'en' }, { locale: 'it' }]))
  })

  it('confirms the language saved from the profile even after leaving the page', async () => {
    signedIn('it')
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.patch('/api/profile', async () => {
        await gate
        return HttpResponse.json(currentUserResponse({ ...adminUser, locale: 'en' }))
      }),
    )
    const { user, router } = renderRoutes(routes, ['/profile'], { toaster: false })
    await screen.findByRole('heading', { level: 1, name: 'Profilo' })

    await user.click(screen.getByRole('radio', { name: 'English' }))
    await act(() => router.navigate('/'))
    await screen.findByRole('heading', { level: 1, name: 'Hi, Giulia' })
    act(release)

    expect(await screen.findByText('Language saved.')).toBeInTheDocument()
  })
})
