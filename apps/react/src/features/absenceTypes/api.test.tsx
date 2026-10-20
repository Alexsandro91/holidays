import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import {
  useAbsenceTypes,
  useArchiveAbsenceType,
  useCreateAbsenceType,
  useProfileAbsenceTypes,
  useReorderAbsenceTypes,
  useRestoreAbsenceType,
  useUpdateAbsenceType,
  useUpdateUserEnablements,
  useUserAbsenceTypes,
} from '@/features/absenceTypes/api'
import type { AbsenceTypeInput } from '@/features/absenceTypes/api'
import { createQueryClient } from '@/lib/queryClient'
import { absenceTypesQueryKey } from '@/lib/queryKeys'
import { server } from '@/test/server'

const renderWithClient = <T,>(hook: () => T) => {
  const queryClient = createQueryClient({ retry: false })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { ...renderHook(hook, { wrapper }), queryClient }
}

const type = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  code: 'vacation',
  name: 'Ferie',
  custom_name: null,
  is_system: true,
  allows_days: true,
  allows_half_days: true,
  allows_hours: true,
  balance: 'vacation',
  requires_approval: true,
  employment_types: ['employee'],
  requires_enablement: false,
  day_count: 'working',
  requires_certificate: false,
  limit: null,
  position: 1,
  archived_at: null,
  enabled_users_count: null,
  ...overrides,
})

const input: AbsenceTypeInput = {
  name: 'Lutto',
  allowsDays: true,
  allowsHalfDays: false,
  allowsHours: false,
  balance: null,
  requiresApproval: true,
  employmentTypes: ['employee', 'intern'],
  requiresEnablement: false,
  dayCount: 'calendar',
  requiresCertificate: true,
  limit: { amount: 3, unit: 'days', period: 'request' },
}

const probe = (queryClient: ReturnType<typeof renderWithClient>['queryClient']) => {
  queryClient.setQueryData([...absenceTypesQueryKey, 'probe'], 1)
  return () => queryClient.getQueryState([...absenceTypesQueryKey, 'probe'])?.isInvalidated
}

describe('absence types api', () => {
  it('asks for the status and reads the counts', async () => {
    const urls: URL[] = []
    server.use(
      http.get('/api/absence-types', ({ request }) => {
        urls.push(new URL(request.url))
        return HttpResponse.json({ data: [type()], meta: { counts: { active: 16, archived: 1 } } })
      }),
    )

    const { result } = renderWithClient(() => useAbsenceTypes('archived'))

    await waitFor(() => expect(result.current.data?.meta.counts).toEqual({ active: 16, archived: 1 }))
    expect(urls[0]?.searchParams.get('filter[status]')).toBe('archived')
  })

  it('fails the query when a field of a type is missing', async () => {
    server.use(http.get('/api/absence-types', () => HttpResponse.json({ data: [type({ day_count: undefined })], meta: { counts: { active: 1, archived: 0 } } })))

    const { result } = renderWithClient(() => useAbsenceTypes('active'))

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.name).toBe('ZodError')
  })

  it('creates a type with the wire names and invalidates the types', async () => {
    const bodies: unknown[] = []
    server.use(
      http.post('/api/absence-types', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: type({ id: 17, code: null, name: 'Lutto' }) }, { status: 201 })
      }),
    )
    const { result, queryClient } = renderWithClient(() => useCreateAbsenceType())
    const invalidated = probe(queryClient)

    await act(async () => {
      await result.current.mutateAsync(input)
    })

    expect(bodies[0]).toEqual({
      name: 'Lutto',
      allows_days: true,
      allows_half_days: false,
      allows_hours: false,
      balance: null,
      requires_approval: true,
      employment_types: ['employee', 'intern'],
      requires_enablement: false,
      day_count: 'calendar',
      requires_certificate: true,
      limit: { amount: 3, unit: 'days', period: 'request' },
    })
    expect(invalidated()).toBe(true)
  })

  it('updates only the given fields and invalidates the types', async () => {
    const bodies: unknown[] = []
    server.use(
      http.patch('/api/absence-types/5', async ({ request }) => {
        bodies.push(await request.json())
        return HttpResponse.json({ data: type({ id: 5 }) })
      }),
    )
    const { result, queryClient } = renderWithClient(() => useUpdateAbsenceType())
    const invalidated = probe(queryClient)

    await act(async () => {
      await result.current.mutateAsync({ id: 5, name: null, limit: null })
    })

    expect(bodies[0]).toEqual({ name: null, limit: null })
    expect(invalidated()).toBe(true)
  })

  it('archives and restores a type and invalidates the types', async () => {
    const calls: string[] = []
    server.use(
      http.post('/api/absence-types/5/archive', () => {
        calls.push('archive')
        return HttpResponse.json({ data: type({ id: 5, archived_at: '2026-10-20T10:00:00+02:00' }) })
      }),
      http.post('/api/absence-types/5/restore', () => {
        calls.push('restore')
        return HttpResponse.json({ data: type({ id: 5 }) })
      }),
    )
    const archive = renderWithClient(() => useArchiveAbsenceType())
    const restore = renderWithClient(() => useRestoreAbsenceType())
    const archived = probe(archive.queryClient)
    const restored = probe(restore.queryClient)

    await act(async () => {
      await archive.result.current.mutateAsync(5)
      await restore.result.current.mutateAsync(5)
    })

    expect(calls).toEqual(['archive', 'restore'])
    expect(archived()).toBe(true)
    expect(restored()).toBe(true)
  })

  it('sends the new order and invalidates the types', async () => {
    const bodies: unknown[] = []
    server.use(
      http.put('/api/absence-types/order', async ({ request }) => {
        bodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { result, queryClient } = renderWithClient(() => useReorderAbsenceTypes())
    const invalidated = probe(queryClient)

    await act(async () => {
      await result.current.mutateAsync([3, 1, 2])
    })

    expect(bodies[0]).toEqual({ ids: [3, 1, 2] })
    expect(invalidated()).toBe(true)
  })

  it('reads the types of a person and saves the enablements', async () => {
    const bodies: unknown[] = []
    server.use(
      http.get('/api/users/2/absence-types', () => HttpResponse.json({ data: [{ id: 9, name: 'Smart working', requires_enablement: true, enabled: false }] })),
      http.put('/api/users/2/absence-type-enablements', async ({ request }) => {
        bodies.push(await request.json())
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const list = renderWithClient(() => useUserAbsenceTypes(2))
    await waitFor(() => expect(list.result.current.data?.[0]?.enabled).toBe(false))

    const { result, queryClient } = renderWithClient(() => useUpdateUserEnablements(2))
    const invalidated = probe(queryClient)
    await act(async () => {
      await result.current.mutateAsync([9])
    })

    expect(bodies[0]).toEqual({ absence_type_ids: [9] })
    expect(invalidated()).toBe(true)
  })

  it('reads the types the profile can use and fails on a malformed option', async () => {
    server.use(http.get('/api/profile/absence-types', () => HttpResponse.json({ data: [{ id: 1, name: 'Ferie', requires_enablement: false, enabled: true }] })))
    const ok = renderWithClient(() => useProfileAbsenceTypes())
    await waitFor(() => expect(ok.result.current.data).toHaveLength(1))

    server.use(http.get('/api/profile/absence-types', () => HttpResponse.json({ data: [{ id: 1, name: 'Ferie' }] })))
    const broken = renderWithClient(() => useProfileAbsenceTypes())
    await waitFor(() => expect(broken.result.current.isError).toBe(true))
  })
})
