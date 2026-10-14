import { QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCurrentUser, useVerifyCode } from '@/features/auth/api'
import { createQueryClient } from '@/lib/queryClient'
import { userQueryKey } from '@/lib/queryKeys'
import { adminUser, currentUserResponse } from '@/test/fixtures'
import { server } from '@/test/server'

const renderWithClient = <T,>(hook: () => T) => {
  const queryClient = createQueryClient({ retry: false })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { ...renderHook(hook, { wrapper }), queryClient }
}

describe('current user', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads first and last name and the session limits, measured from the moment of the read', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-10-14T10:00:00Z') })
    server.use(http.get('/api/auth/user', () => HttpResponse.json(currentUserResponse(adminUser, { idle: 7200, absolute: 3600 }))))

    const { result } = renderWithClient(() => useCurrentUser())

    await waitFor(() => expect(result.current.data).toBeTruthy())
    const user = result.current.data
    expect(user?.first_name).toBe('Giulia')
    expect(user?.last_name).toBe('Rossi')
    expect(user?.session?.idleTimeoutMs).toBe(7_200_000)
    // Scadenza assoluta = istante della lettura + secondi restanti (l'orologio del dispositivo misura solo il tempo trascorso)
    const deadline = user?.session?.absoluteDeadline ?? 0
    const readAt = new Date('2026-10-14T10:00:00Z').getTime()
    expect(deadline - readAt).toBeGreaterThanOrEqual(3_600_000)
    expect(deadline - readAt).toBeLessThan(3_605_000)
  })

  it('rereads the user after the code to learn the session limits', async () => {
    let reads = 0
    server.use(
      http.post('/api/auth/two-factor', () => HttpResponse.json({ data: adminUser })),
      http.get('/api/auth/user', () => {
        reads += 1
        return HttpResponse.json(currentUserResponse(adminUser))
      }),
    )
    const { result, queryClient } = renderWithClient(() => ({ verify: useVerifyCode(), current: useCurrentUser() }))
    // Prima dell'accesso: nessuna sessione
    await waitFor(() => expect(reads).toBe(1))

    await result.current.verify.mutateAsync('123456')

    await waitFor(() => expect(reads).toBe(2))
    await waitFor(() => expect(queryClient.getQueryData<{ session?: unknown }>(userQueryKey)?.session).toBeTruthy())
  })
})
