import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import {
  useApprovals,
  useCreateLeaveRequest,
  useLeaveAction,
  useLeavePreview,
  useLeaveRequest,
  useMyLeaveRequests,
  useProfileCalendar,
} from '@/features/leave/api'
import type { LeaveAction, LeaveDraftInput } from '@/features/leave/api'
import { createQueryClient } from '@/lib/queryClient'
import { balancesQueryKey, leaveQueryKey, userQueryKey } from '@/lib/queryKeys'
import { pageResponse } from '@/test/balancesFixtures'
import { leavePreview, leaveRequest, profileCalendar } from '@/test/leaveFixtures'
import { server } from '@/test/server'

const renderWithClient = <T,>(hook: () => T) => {
  const queryClient = createQueryClient({ retry: false })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { ...renderHook(hook, { wrapper }), queryClient }
}

const draft: LeaveDraftInput = { absence_type_id: 1, unit: 'days', starts_on: '2026-10-26', ends_on: '2026-10-30' }

describe('leave api', () => {
  it('reads the calendar of the range', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/profile/calendar', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json({ data: profileCalendar() })
      }),
    )

    const { result } = renderWithClient(() => useProfileCalendar('2026-10-01', '2026-10-31'))

    await waitFor(() => expect(result.current.data?.requests[0]?.status).toBe('pending'))
    expect(urls[0]?.searchParams.get('from')).toBe('2026-10-01')
    expect(urls[0]?.searchParams.get('to')).toBe('2026-10-31')
  })

  it('pages my requests of the year, 20 at a time', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/leave-requests', ({ request }) => {
        urls.push(new URL(request.url))
        const page = Number(new URL(request.url).searchParams.get('page'))
        return HttpResponse.json(pageResponse([leaveRequest({ id: page })], page, 2))
      }),
    )

    const { result } = renderWithClient(() => useMyLeaveRequests(2026))

    await waitFor(() => expect(result.current.data?.pages[0]?.data[0]?.id).toBe(1))
    expect(result.current.hasNextPage).toBe(true)
    await act(async () => {
      await result.current.fetchNextPage()
    })
    await waitFor(() => expect(result.current.data?.pages).toHaveLength(2))
    expect(result.current.hasNextPage).toBe(false)
    expect(urls[0]?.searchParams.get('year')).toBe('2026')
  })

  it('reads the detail of a request with its days', async () => {
    server.use(http.get('/api/leave-requests/7', () => HttpResponse.json({ data: leaveRequest({ id: 7, days: [{ date: '2026-10-26', minutes: 480 }] }) })))

    const { result } = renderWithClient(() => useLeaveRequest(7))

    await waitFor(() => expect(result.current.data?.days?.[0]?.minutes).toBe(480))
  })

  it('does not read the detail without an id', () => {
    const { result } = renderWithClient(() => useLeaveRequest(null))
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('does not start the preview without a draft', () => {
    let called = false
    server.use(
      http.post('/api/leave-requests/preview', () => {
        called = true
        return HttpResponse.json({ data: leavePreview() })
      }),
    )

    const { result } = renderWithClient(() => useLeavePreview(null))

    expect(result.current.fetchStatus).toBe('idle')
    expect(called).toBe(false)
  })

  it('posts the draft to the preview and validates the answer', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('/api/leave-requests/preview', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: leavePreview({ warnings: [{ code: 'balance_insufficient', params: { after_minutes: -30 } }] }) })
      }),
    )

    const { result } = renderWithClient(() => useLeavePreview(draft))

    await waitFor(() => expect(result.current.data?.minutes).toBe(960))
    expect(result.current.data?.warnings[0]?.code).toBe('balance_insufficient')
    expect(bodies[0]).toEqual(draft)
  })

  it('reads the approvals with the location filter', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/approvals', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json({ data: [leaveRequest({ warnings: [] })], meta: { count: 1 } })
      }),
    )

    const { result } = renderWithClient(() => useApprovals(3))

    await waitFor(() => expect(result.current.data?.meta.count).toBe(1))
    expect(urls[0]?.searchParams.get('filter[location]')).toBe('3')
  })

  it('omits the location filter of the approvals when it is empty', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/approvals', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json({ data: [], meta: { count: 0 } })
      }),
    )

    const { result } = renderWithClient(() => useApprovals())

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(urls[0]?.searchParams.has('filter[location]')).toBe(false)
  })

  it('creates a request and refreshes requests, balances and the counter', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('/api/leave-requests', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: leaveRequest({ warnings: [] }) }, { status: 201 })
      }),
    )
    const { result, queryClient } = renderWithClient(() => useCreateLeaveRequest())
    queryClient.setQueryData([...leaveQueryKey, 'x'], 1)
    queryClient.setQueryData([...balancesQueryKey, 'x'], 1)
    queryClient.setQueryData(userQueryKey, null)

    await act(async () => {
      await result.current.mutateAsync({ ...draft, note: 'Mare' })
    })

    expect(bodies[0]).toEqual({ ...draft, note: 'Mare' })
    expect(queryClient.getQueryState([...leaveQueryKey, 'x'])?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState([...balancesQueryKey, 'x'])?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(userQueryKey)?.isInvalidated).toBe(true)
  })

  it.each<[LeaveAction, string]>([
    ['withdraw', '/api/leave-requests/4/withdraw'],
    ['cancellation', '/api/leave-requests/4/cancellation'],
    ['approve', '/api/leave-requests/4/approve'],
    ['reject', '/api/leave-requests/4/reject'],
    ['approve_cancellation', '/api/leave-requests/4/cancellation/approve'],
    ['reject_cancellation', '/api/leave-requests/4/cancellation/reject'],
    ['cancel', '/api/leave-requests/4/cancel'],
  ])('runs the %s action on the right route and refreshes the caches', async (action, path) => {
    const paths: string[] = []
    server.use(
      http.post('/api/leave-requests/:id/*', ({ request }) => {
        paths.push(new URL(request.url).pathname)
        return HttpResponse.json({ data: leaveRequest({ id: 4 }) })
      }),
    )
    const { result, queryClient } = renderWithClient(() => useLeaveAction())
    queryClient.setQueryData([...leaveQueryKey, 'x'], 1)
    queryClient.setQueryData([...balancesQueryKey, 'x'], 1)
    queryClient.setQueryData(userQueryKey, null)

    await act(async () => {
      await result.current.mutateAsync({ id: 4, action })
    })

    expect(paths).toEqual([path])
    expect(queryClient.getQueryState([...leaveQueryKey, 'x'])?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState([...balancesQueryKey, 'x'])?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(userQueryKey)?.isInvalidated).toBe(true)
  })

  it('sends the note of a rejection as decision_note', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('/api/leave-requests/4/reject', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: leaveRequest({ id: 4, status: 'rejected' }) })
      }),
    )
    const { result } = renderWithClient(() => useLeaveAction())

    await act(async () => {
      await result.current.mutateAsync({ id: 4, action: 'reject', note: 'Periodo di chiusura' })
    })

    expect(bodies[0]).toEqual({ decision_note: 'Periodo di chiusura' })
  })

  it('refreshes the caches also when the action fails', async () => {
    server.use(http.post('/api/leave-requests/4/approve', () => HttpResponse.json({ message: 'Stato cambiato', code: 'leave.state_changed' }, { status: 409 })))
    const { result, queryClient } = renderWithClient(() => useLeaveAction())
    queryClient.setQueryData([...leaveQueryKey, 'x'], 1)

    await act(async () => {
      await result.current.mutateAsync({ id: 4, action: 'approve' }).catch(() => undefined)
    })

    expect(queryClient.getQueryState([...leaveQueryKey, 'x'])?.isInvalidated).toBe(true)
  })
})
