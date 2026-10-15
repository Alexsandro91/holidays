import { act, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTIVITY_STORAGE_KEY } from '@/lib/sessionActivity'
import { routes } from '@/routes'
import { expectNoA11yViolations } from '@/test/axe'
import { adminUser, currentUserResponse } from '@/test/fixtures'
import { renderRoutes } from '@/test/render'
import { server } from '@/test/server'

const MINUTE = 60_000

/** Utente collegato; conta le letture di /api/auth/user (la prima è il caricamento). */
const signedIn = (session: { idle?: number; absolute?: number } = {}) => {
  const reads = { count: 0 }
  server.use(
    http.get('/api/auth/user', () => {
      reads.count += 1
      return HttpResponse.json(currentUserResponse(adminUser, session))
    }),
  )
  return reads
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))

const openHome = async () => {
  const view = renderRoutes(routes, ['/'], { toaster: false, advanceTimers: (delay) => vi.advanceTimersByTime(delay) })
  await screen.findByRole('heading', { level: 1, name: 'Ciao, Giulia' })
  return view
}

describe('SessionExpiryDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-10-14T08:00:00Z') })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('warns two minutes before the idle timeout, after 1h58 of inactivity', async () => {
    signedIn()
    await openHome()

    await advance(117 * MINUTE)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    await advance(MINUTE + 1000)
    const dialog = await screen.findByRole('alertdialog', { name: 'La sessione sta per scadere' })
    expect(within(dialog).getByRole('button', { name: 'Resta collegato' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Esci' })).toBeInTheDocument()
    // Conto alla rovescia in minuti e secondi, nascosto ai lettori di schermo (non si annuncia ogni secondo)
    const countdown = within(dialog).getByText(/^[0-2]:[0-5]\d$/)
    expect(countdown.closest('[aria-hidden="true"]')).not.toBeNull()
    await advance(200)
    expect(within(dialog).getByText('La sessione scade tra meno di 2 minuti.')).toHaveAttribute('aria-live', 'polite')
  })

  it('mounts the live region empty and fills it right after opening, so that it is announced', async () => {
    signedIn()
    await openHome()

    await advance(118 * MINUTE + 1000)
    const dialog = screen.getByRole('alertdialog')
    const live = dialog.querySelector('[aria-live="polite"]')
    expect(live).not.toBeNull()
    expect(live).toBeEmptyDOMElement()

    await advance(200)
    expect(live).toHaveTextContent('La sessione scade tra meno di 2 minuti.')
  })

  it('announces only once more, thirty seconds before the end', async () => {
    signedIn()
    await openHome()

    await advance(118 * MINUTE + 1000)
    const dialog = await screen.findByRole('alertdialog')
    await advance(200)
    const live = within(dialog).getByText('La sessione scade tra meno di 2 minuti.')

    await advance(79_800)
    expect(live).toHaveTextContent('La sessione scade tra meno di 2 minuti.')
    await advance(10_000)
    expect(live).toHaveTextContent('Mancano 30 secondi alla scadenza della sessione.')
  })

  it('renews the session with "Stay signed in"', async () => {
    const reads = signedIn()
    const { user } = await openHome()
    expect(reads.count).toBe(1)

    await advance(118 * MINUTE + 1000)
    await user.click(await screen.findByRole('button', { name: 'Resta collegato' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(reads.count).toBe(2)
    // La sessione rinnovata scade di nuovo dopo due ore dall'ultima attività
    await advance(117 * MINUTE)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('does not expire while "Stay signed in" is still waiting for the server', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let reads = 0
    server.use(
      http.get('/api/auth/user', async () => {
        reads += 1
        // Rete lenta: la rilettura del rinnovo risponde solo quando il test lo decide
        if (reads > 1) await gate
        return HttpResponse.json(currentUserResponse(adminUser))
      }),
    )
    const { user, router } = await openHome()

    await advance(119 * MINUTE + 58_000)
    await user.click(await screen.findByRole('button', { name: 'Resta collegato' }))
    await advance(5000)
    // Le notifiche di TanStack Query partono con un setTimeout: si lascia scorrere ancora un attimo
    await advance(100)
    // Il conto è arrivato a zero, ma l'esito del rinnovo decide: niente fine sessione locale nel frattempo
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/')

    act(release)

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/')
    expect(screen.getByRole('heading', { level: 1, name: 'Ciao, Giulia' })).toBeInTheDocument()
  })

  it('does not spin the timer while "Stay signed in" waits past the deadline', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let reads = 0
    server.use(
      http.get('/api/auth/user', async () => {
        reads += 1
        if (reads > 1) await gate
        return HttpResponse.json(currentUserResponse(adminUser))
      }),
    )
    const { user } = await openHome()

    await advance(119 * MINUTE + 58_000)
    await user.click(await screen.findByRole('button', { name: 'Resta collegato' }))
    await advance(5000)
    const spy = vi.spyOn(window, 'setTimeout')
    // Il rinnovo resta in volo oltre lo zero: ogni millisecondo dell'orologio di sistema non deve riarmare un timer
    for (let step = 0; step < 30; step += 1) {
      vi.setSystemTime(Date.now() + 1)
      await advance(0)
    }
    const zeroDelay = spy.mock.calls.filter(([, delay]) => delay === 0).length
    spy.mockRestore()

    expect(zeroDelay).toBeLessThan(5)
    act(release)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('ends the session normally when the renewal answers 401', async () => {
    let reads = 0
    server.use(
      http.get('/api/auth/user', () => {
        reads += 1
        return reads === 1
          ? HttpResponse.json(currentUserResponse(adminUser))
          : HttpResponse.json({ message: 'Sessione scaduta.', meta: { reason: 'session_expired' } }, { status: 401 })
      }),
    )
    const { user, router } = await openHome()

    await advance(118 * MINUTE + 1000)
    await user.click(await screen.findByRole('button', { name: 'Resta collegato' }))

    expect(await screen.findByText('Sessione scaduta. Accedi di nuovo.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(new URLSearchParams(router.state.location.search).get('reason')).toBe('expired')
  })

  it('keeps the warning open with an error when the renewal cannot reach the server', async () => {
    let reads = 0
    server.use(
      http.get('/api/auth/user', () => {
        reads += 1
        return reads === 1 ? HttpResponse.json(currentUserResponse(adminUser)) : HttpResponse.error()
      }),
    )
    const { user } = await openHome()

    await advance(118 * MINUTE + 1000)
    await user.click(await screen.findByRole('button', { name: 'Resta collegato' }))

    expect(await screen.findByText('Impossibile contattare il server. Controlla la connessione e riprova.')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('signs out with "Sign out"', async () => {
    signedIn()
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })))
    const { user, router } = await openHome()

    await advance(118 * MINUTE + 1000)
    await user.click(await screen.findByRole('button', { name: 'Esci' }))

    expect(await screen.findByText('Sei uscito. A presto.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('sends a single sign-out on a double click of "Sign out"', async () => {
    signedIn()
    let logouts = 0
    server.use(
      http.post('/api/auth/logout', () => {
        logouts += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { user } = await openHome()

    await advance(118 * MINUTE + 1000)
    await user.dblClick(await screen.findByRole('button', { name: 'Esci' }))

    expect(await screen.findByText('Sei uscito. A presto.')).toBeInTheDocument()
    await advance(200)
    expect(logouts).toBe(1)
  })

  it('closes by itself when another tab renews the session', async () => {
    signedIn()
    await openHome()

    await advance(118 * MINUTE + 1000)
    await screen.findByRole('alertdialog')

    const now = String(Date.now())
    window.localStorage.setItem(ACTIVITY_STORAGE_KEY, now)
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: ACTIVITY_STORAGE_KEY, newValue: now }))
    })

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  })

  it('warns about the absolute duration with "Got it" only, once per deadline', async () => {
    // Restano 30 minuti alla durata assoluta: scade prima dell'inattività
    signedIn({ absolute: 30 * 60 })
    const { user } = await openHome()

    await advance(28 * MINUTE + 1000)
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('Tra poco dovrai accedere di nuovo: salva il lavoro.')).toBeInTheDocument()
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual(['Ho capito'])

    await user.click(within(dialog).getByRole('button', { name: 'Ho capito' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())

    await advance(30_000)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('still ends the session at the absolute deadline after "Got it"', async () => {
    signedIn({ absolute: 30 * 60 })
    const { user, router } = await openHome()

    await advance(28 * MINUTE + 1000)
    await user.click(await screen.findByRole('button', { name: 'Ho capito' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    // Orologio di sistema un po' indietro rispetto ai timer: lo scatto anticipato non deve fermare la scadenza
    vi.setSystemTime(Date.now() - 2000)

    await advance(2 * MINUTE)
    await advance(5000)

    expect(await screen.findByText('Sessione scaduta. Accedi di nuovo.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
  })

  it('rearms the timer when it fires before the wall clock reaches the target', async () => {
    signedIn()
    await openHome()
    // Correzione NTP all'indietro dopo che il timer è stato armato
    vi.setSystemTime(Date.now() - 2000)

    await advance(118 * MINUTE + 1000)
    await advance(5000)

    expect(await screen.findByRole('alertdialog', { name: 'La sessione sta per scadere' })).toBeInTheDocument()
  })

  it.each([
    ['visibilitychange', () => document.dispatchEvent(new Event('visibilitychange'))],
    ['focus', () => window.dispatchEvent(new Event('focus'))],
    ['pageshow', () => window.dispatchEvent(new Event('pageshow'))],
  ])('ends the session on %s after a sleep past the deadline', async (_event, wake) => {
    const reads = signedIn()
    const { router } = await openHome()

    // Sospensione: l'orologio di sistema va avanti di 3 ore, i timer del browser no
    vi.setSystemTime(Date.now() + 180 * MINUTE)
    act(wake)

    expect(await screen.findByText('Sessione scaduta. Accedi di nuovo.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(reads.count).toBe(1)
  })

  it('opens the warning on wake-up within the last two minutes', async () => {
    signedIn()
    await openHome()

    vi.setSystemTime(Date.now() + 119 * MINUTE)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(await screen.findByRole('alertdialog', { name: 'La sessione sta per scadere' })).toBeInTheDocument()
  })

  it('ends the session at the deadline without calling the server and offers the way back', async () => {
    const reads = signedIn()
    const { router } = renderRoutes(routes, ['/profile'], { toaster: false, advanceTimers: (delay) => vi.advanceTimersByTime(delay) })
    await screen.findByRole('heading', { level: 1, name: 'Profilo' })
    // Lo storico del profilo ha finito di caricare: la scadenza non coglie una richiesta a metà
    await screen.findByText('Ancora nessuna tappa.')

    await advance(120 * MINUTE + 1000)

    expect(await screen.findByText('Sessione scaduta. Accedi di nuovo.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(new URLSearchParams(router.state.location.search).get('redirect')).toBe('/profile')
    expect(new URLSearchParams(router.state.location.search).get('reason')).toBe('expired')
    expect(reads.count).toBe(1)
  })

  it('has no accessibility violations while open', async () => {
    signedIn()
    const { container } = await openHome()

    await advance(118 * MINUTE + 1000)
    await screen.findByRole('alertdialog')

    await expectNoA11yViolations(container.ownerDocument.body)
  })
})
