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
    expect(within(dialog).getByText('La sessione scade tra meno di 2 minuti.')).toHaveAttribute('aria-live', 'polite')
  })

  it('announces only once more, thirty seconds before the end', async () => {
    signedIn()
    await openHome()

    await advance(118 * MINUTE + 1000)
    const dialog = await screen.findByRole('alertdialog')
    const live = within(dialog).getByText('La sessione scade tra meno di 2 minuti.')

    await advance(80_000)
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

  it('signs out with "Sign out"', async () => {
    signedIn()
    server.use(http.post('/api/auth/logout', () => new HttpResponse(null, { status: 204 })))
    const { user, router } = await openHome()

    await advance(118 * MINUTE + 1000)
    await user.click(await screen.findByRole('button', { name: 'Esci' }))

    expect(await screen.findByText('Sei uscito. A presto.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
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

  it('ends the session at the deadline without calling the server and offers the way back', async () => {
    const reads = signedIn()
    const { router } = renderRoutes(routes, ['/profile'], { toaster: false, advanceTimers: (delay) => vi.advanceTimersByTime(delay) })
    await screen.findByRole('heading', { level: 1, name: 'Profilo' })

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
