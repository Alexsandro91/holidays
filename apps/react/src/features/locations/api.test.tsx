import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import {
  useAddLocationSchedule,
  useAddUserSchedule,
  useClosures,
  useCreateClosure,
  useDeleteUserSchedule,
  useLocationCalendar,
  useLocationOptions,
  useLocations,
  useUserSchedules,
} from '@/features/locations/api'
import { createQueryClient } from '@/lib/queryClient'
import { balancesQueryKey } from '@/lib/queryKeys'
import { closure, location, locationListResponse, schedule } from '@/test/locationsFixtures'
import { server } from '@/test/server'

const renderWithClient = <T,>(hook: () => T) => {
  const queryClient = createQueryClient({ retry: false })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { ...renderHook(hook, { wrapper }), queryClient }
}

describe('locations api', () => {
  it('sends status, sort and page of the list and reads the counts', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/locations', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json(locationListResponse([location()], { active: 1, archived: 2 }))
      }),
    )

    const { result } = renderWithClient(() => useLocations({ status: 'archived', sort: '-name', page: 2 }))

    await waitFor(() => expect(result.current.data).toBeTruthy())
    expect(urls[0]?.searchParams.get('filter[status]')).toBe('archived')
    expect(urls[0]?.searchParams.get('sort')).toBe('-name')
    expect(urls[0]?.searchParams.get('page')).toBe('2')
    expect(result.current.data?.meta.counts).toEqual({ active: 1, archived: 2 })
  })

  it('reads the options for the selects', async () => {
    server.use(http.get('/api/locations/options', () => HttpResponse.json({ data: [{ id: 1, name: 'Sede principale', is_primary: true }] })))

    const { result } = renderWithClient(() => useLocationOptions())

    await waitFor(() => expect(result.current.data).toEqual([{ id: 1, name: 'Sede principale', is_primary: true }]))
  })

  it('reads the calendar of a year with its reasons', async () => {
    server.use(
      http.get('/api/locations/1/calendar', ({ request }) => {
        expect(new URL(request.url).searchParams.get('year')).toBe('2027')
        return HttpResponse.json({
          data: {
            year: 2027,
            schedules: [schedule()],
            days: [{ date: '2027-03-29', reasons: [{ type: 'national_holiday', label: 'Lunedì dell’Angelo' }] }],
          },
        })
      }),
    )

    const { result } = renderWithClient(() => useLocationCalendar(1, 2027))

    await waitFor(() => expect(result.current.data?.days[0]?.reasons[0]?.type).toBe('national_holiday'))
  })

  it('asks for the closures of a location together with the company-wide ones', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/closures', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json({ data: [closure()] })
      }),
    )

    const { result } = renderWithClient(() => useClosures(2026, 3))

    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(urls[0]?.searchParams.get('year')).toBe('2026')
    expect(urls[0]?.searchParams.get('filter[location]')).toBe('3')
  })

  it('sends schedules and closures in the API format', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('/api/locations/1/schedules', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: schedule({ id: 9, valid_from: '2026-11-01' }) }, { status: 201 })
      }),
      http.post('/api/users/7/schedules', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: schedule({ id: 10, follows_location: true }) }, { status: 201 })
      }),
      http.post('/api/closures', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: closure() }, { status: 201 })
      }),
    )

    const { result } = renderWithClient(() => ({ location: useAddLocationSchedule(1), user: useAddUserSchedule(7), closure: useCreateClosure() }))

    await act(async () => {
      await result.current.location.mutateAsync({ validFrom: '2026-11-01', minutes: [480, 480, 480, 480, 240, 0, 0] })
      await result.current.user.mutateAsync({ validFrom: '2026-11-01', followsLocation: true })
      await result.current.closure.mutateAsync({ locationId: null, startsOn: '2026-08-10', endsOn: '2026-08-21', description: 'Chiusura estiva' })
    })

    expect(bodies).toEqual([
      { valid_from: '2026-11-01', minutes: [480, 480, 480, 480, 240, 0, 0] },
      { valid_from: '2026-11-01', follows_location: true },
      { location_id: null, starts_on: '2026-08-10', ends_on: '2026-08-21', description: 'Chiusura estiva' },
    ])
  })

  it('invalidates the balances after a change to a schedule or a location', async () => {
    server.use(
      http.post('/api/users/7/schedules', () => HttpResponse.json({ data: schedule({ id: 10, follows_location: true }) }, { status: 201 })),
      http.delete('/api/users/7/schedules/10', () => new HttpResponse(null, { status: 204 })),
      http.post('/api/locations/1/schedules', () => HttpResponse.json({ data: schedule({ id: 9 }) }, { status: 201 })),
    )
    const { result, queryClient } = renderWithClient(() => ({ user: useAddUserSchedule(7), remove: useDeleteUserSchedule(7), location: useAddLocationSchedule(1) }))
    const mutations: [string, () => Promise<unknown>][] = [
      ['user', () => result.current.user.mutateAsync({ validFrom: '2026-11-01', followsLocation: true })],
      ['remove', () => result.current.remove.mutateAsync(10)],
      ['location', () => result.current.location.mutateAsync({ validFrom: '2026-11-01', minutes: [240, 240, 240, 240, 240, 0, 0] })],
    ]

    // Ore settimanali, part-time e quote della pagina Saldi dipendono dagli orari di persona e sede
    for (const [name, mutate] of mutations) {
      queryClient.setQueryData([...balancesQueryKey, 'probe', name], 1)
      await act(async () => {
        await mutate()
      })
      expect(queryClient.getQueryState([...balancesQueryKey, 'probe', name])?.isInvalidated).toBe(true)
    }
  })

  it('reads personal schedules and the schedule of the location', async () => {
    server.use(
      http.get('/api/users/7/schedules', () =>
        HttpResponse.json({ data: { schedules: [schedule({ id: 3, minutes: [240, 240, 240, 0, 0, 0, 0] })], location_schedule: schedule() } }),
      ),
    )

    const { result } = renderWithClient(() => useUserSchedules(7))

    await waitFor(() => expect(result.current.data?.schedules[0]?.minutes).toEqual([240, 240, 240, 0, 0, 0, 0]))
    expect(result.current.data?.location_schedule?.minutes).toEqual([480, 480, 480, 480, 480, 0, 0])
  })
})
