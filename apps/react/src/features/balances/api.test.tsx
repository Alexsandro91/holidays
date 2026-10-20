import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import {
  useAdjustBalance,
  useAlignBalances,
  useBalanceOverview,
  useBalancesAt,
  useCompanyAccrual,
  useLocationAccrual,
  useProfileBalanceMovements,
  useProfileBalances,
  useUpdateCompanyAccrual,
  useUpdateLocationAccrual,
  useUpdateUserAccrual,
  useUserAccrual,
  useUserBalanceMovements,
  useUserBalances,
} from '@/features/balances/api'
import { createQueryClient } from '@/lib/queryClient'
import { balancesQueryKey } from '@/lib/queryKeys'
import { balanceMovement, balanceOverviewRow, balanceSummary, pageResponse } from '@/test/balancesFixtures'
import { server } from '@/test/server'

const renderWithClient = <T,>(hook: () => T) => {
  const queryClient = createQueryClient({ retry: false })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { ...renderHook(hook, { wrapper }), queryClient }
}

const accrualBody = {
  data: {
    values: { vacation_minutes: 9600, rol_minutes: 0, ex_holidays_minutes: 0 },
    effective: {
      vacation: { minutes: 9600, source: 'company' },
      rol: { minutes: 0, source: 'company' },
      ex_holidays: { minutes: 0, source: 'company' },
    },
  },
}

describe('balances api', () => {
  it('sends the filters, sort and page of the overview', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/balances', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json(pageResponse([balanceOverviewRow()]))
      }),
    )

    const { result } = renderWithClient(() => useBalanceOverview({ search: ' sara ', onlyNegative: true, locationId: 3, sort: '-location', page: 2 }))

    await waitFor(() => expect(result.current.data?.data[0]?.user.name).toBe('Sara Colombo'))
    const params = urls[0]?.searchParams
    expect(params?.get('filter[search]')).toBe('sara')
    expect(params?.get('filter[negative]')).toBe('1')
    expect(params?.get('filter[location]')).toBe('3')
    expect(params?.get('sort')).toBe('-location')
    expect(params?.get('page')).toBe('2')
  })

  it('omits the empty filters of the overview', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/balances', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json(pageResponse([]))
      }),
    )

    const { result } = renderWithClient(() => useBalanceOverview({ search: '', onlyNegative: false, locationId: null, sort: 'name', page: 1 }))

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(urls[0]?.search).toBe('?sort=name')
  })

  it('reads the summary of a person for a year', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/users/2/balances', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json({ data: balanceSummary() })
      }),
    )

    const { result } = renderWithClient(() => useUserBalances(2, 2026))

    await waitFor(() => expect(result.current.data?.balances).toHaveLength(3))
    expect(urls[0]?.searchParams.get('year')).toBe('2026')
  })

  it('reads the profile summary', async () => {
    server.use(http.get('/api/profile/balances', () => HttpResponse.json({ data: balanceSummary({ can: { adjust: false, manage_accrual: false } }) })))

    const { result } = renderWithClient(() => useProfileBalances(2026))

    await waitFor(() => expect(result.current.data?.can.adjust).toBe(false))
  })

  it('fails the query when a field of the summary is missing', async () => {
    server.use(http.get('/api/users/2/balances', () => HttpResponse.json({ data: { ...balanceSummary(), average_day_minutes: undefined } })))

    const { result } = renderWithClient(() => useUserBalances(2, 2026))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.name).toBe('ZodError')
  })

  it('pages the movements of a person with balance and year', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/users/2/balance-movements', ({ request }) => {
        const url = new URL(request.url)
        urls.push(url)
        const page = Number(url.searchParams.get('page'))
        return HttpResponse.json(pageResponse([balanceMovement({ id: page })], page, 2))
      }),
    )

    const { result } = renderWithClient(() => useUserBalanceMovements(2, { balance: 'rol', year: 2026 }))

    await waitFor(() => expect(result.current.data?.pages).toHaveLength(1))
    expect(result.current.hasNextPage).toBe(true)
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    expect(result.current.hasNextPage).toBe(false)
    expect(urls[0]?.searchParams.get('balance')).toBe('rol')
    expect(urls[0]?.searchParams.get('year')).toBe('2026')
    expect(urls[1]?.searchParams.get('page')).toBe('2')
  })

  it('reads the movements of the profile without the balance filter when all are shown', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/profile/balance-movements', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json(pageResponse([balanceMovement()]))
      }),
    )

    const { result } = renderWithClient(() => useProfileBalanceMovements({ year: 2025 }))

    await waitFor(() => expect(result.current.data?.pages[0]?.data).toHaveLength(1))
    expect(urls[0]?.searchParams.has('balance')).toBe(false)
    expect(urls[0]?.searchParams.get('year')).toBe('2025')
  })

  it('reads the balances at a date and stays idle without one', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/users/2/balances/at', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json({
          data: { date: '2026-09-30', balances: { vacation: 4900, rol: 0, ex_holidays: 0 }, last_alignment: { vacation: null, rol: null, ex_holidays: '2026-08-31' } },
        })
      }),
    )

    const idle = renderWithClient(() => useBalancesAt(2, null))
    expect(idle.result.current.fetchStatus).toBe('idle')

    const { result } = renderWithClient(() => useBalancesAt(2, '2026-09-30'))

    await waitFor(() => expect(result.current.data?.balances.vacation).toBe(4900))
    expect(urls[0]?.searchParams.get('date')).toBe('2026-09-30')
  })

  it('adjusts a balance and invalidates the balances', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('/api/users/2/balance-adjustments', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: balanceMovement({ kind: 'adjustment', minutes: -240, note: 'Errore' }) }, { status: 201 })
      }),
    )
    const { result, queryClient } = renderWithClient(() => useAdjustBalance(2))
    queryClient.setQueryData([...balancesQueryKey, 'probe'], 1)

    await act(async () => {
      await result.current.mutateAsync({ balance: 'vacation', minutes: -240, note: 'Errore' })
    })

    expect(bodies[0]).toEqual({ balance: 'vacation', minutes: -240, note: 'Errore' })
    expect(queryClient.getQueryState([...balancesQueryKey, 'probe'])?.isInvalidated).toBe(true)
  })

  it('aligns the balances sending only the given ones and invalidates the balances', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('/api/users/2/balance-alignments', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: { aligned_on: '2026-09-30', deltas: { vacation: -480 } } }, { status: 201 })
      }),
    )
    const { result, queryClient } = renderWithClient(() => useAlignBalances(2))
    queryClient.setQueryData([...balancesQueryKey, 'probe'], 1)

    let deltas: unknown
    await act(async () => {
      deltas = (await result.current.mutateAsync({ alignedOn: '2026-09-30', values: { vacation: 4465 }, note: ' ' })).deltas
    })

    expect(bodies[0]).toEqual({ aligned_on: '2026-09-30', values: { vacation: 4465 }, note: null })
    expect(deltas).toEqual({ vacation: -480 })
    expect(queryClient.getQueryState([...balancesQueryKey, 'probe'])?.isInvalidated).toBe(true)
  })

  it('reads the company accrual and fails on a malformed answer', async () => {
    server.use(http.get('/api/settings/accrual', () => HttpResponse.json(accrualBody)))
    const ok = renderWithClient(() => useCompanyAccrual())
    await waitFor(() => expect(ok.result.current.data?.values.vacation_minutes).toBe(9600))

    server.use(http.get('/api/settings/accrual', () => HttpResponse.json({ data: { values: accrualBody.data.values } })))
    const broken = renderWithClient(() => useCompanyAccrual())
    await waitFor(() => expect(broken.result.current.isError).toBe(true))
  })

  it.each([
    ['company', 'PATCH', '/api/settings/accrual', () => useUpdateCompanyAccrual()],
    ['location', 'PUT', '/api/locations/4/accrual', () => useUpdateLocationAccrual(4)],
    ['user', 'PUT', '/api/users/2/accrual', () => useUpdateUserAccrual(2)],
  ] as const)('updates the %s accrual and invalidates balances and accrual values', async (_level, method, path, hook) => {
    const bodies: unknown[] = []
    server.use(
      http.all(path, async ({ request }) => {
        if (request.method !== method) return HttpResponse.json({}, { status: 405 })
        bodies.push(await request.json())
        return HttpResponse.json(accrualBody)
      }),
    )
    const { result, queryClient } = renderWithClient(hook)
    queryClient.setQueryData([...balancesQueryKey, 'accrual', 'probe'], 1)
    queryClient.setQueryData([...balancesQueryKey, 'probe'], 1)

    await act(async () => {
      await result.current.mutateAsync({ vacation_minutes: 9600, rol_minutes: null, ex_holidays_minutes: 0 })
    })

    expect(bodies[0]).toEqual({ vacation_minutes: 9600, rol_minutes: null, ex_holidays_minutes: 0 })
    expect(queryClient.getQueryState([...balancesQueryKey, 'probe'])?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState([...balancesQueryKey, 'accrual', 'probe'])?.isInvalidated).toBe(true)
  })

  it('reads the accrual of a location and of a person', async () => {
    server.use(
      http.get('/api/locations/4/accrual', () => HttpResponse.json(accrualBody)),
      http.get('/api/users/2/accrual', () => HttpResponse.json(accrualBody)),
    )

    const location = renderWithClient(() => useLocationAccrual(4))
    const person = renderWithClient(() => useUserAccrual(2))

    await waitFor(() => expect(location.result.current.data?.effective.vacation.source).toBe('company'))
    await waitFor(() => expect(person.result.current.data?.effective.rol.minutes).toBe(0))
  })
})
