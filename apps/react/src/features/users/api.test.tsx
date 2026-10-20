import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { useChangeRole, useDisableUser, useEnableUser, useUpdateUser } from '@/features/users/api'
import { createQueryClient } from '@/lib/queryClient'
import { balancesQueryKey } from '@/lib/queryKeys'
import { server } from '@/test/server'
import { managedUser } from '@/test/usersFixtures'

const renderWithClient = <T,>(hook: () => T) => {
  const queryClient = createQueryClient({ retry: false })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  return { ...renderHook(hook, { wrapper }), queryClient }
}

describe('users api', () => {
  // Ruolo, tipo di rapporto, sede e stato compaiono nella pagina Saldi e cambiano quote e applicabilità
  it('invalidates the balances after changing type, location, role or status of a person', async () => {
    const answer = () => HttpResponse.json({ data: managedUser({ id: 2 }) })
    server.use(
      http.patch('/api/users/2', answer),
      http.patch('/api/users/2/role', answer),
      http.post('/api/users/2/disable', answer),
      http.post('/api/users/2/enable', answer),
    )
    const { result, queryClient } = renderWithClient(() => ({
      update: useUpdateUser(),
      role: useChangeRole(),
      disable: useDisableUser(),
      enable: useEnableUser(),
    }))
    const mutations: [string, () => Promise<unknown>][] = [
      ['update', () => result.current.update.mutateAsync({ id: 2, firstName: 'Sara', lastName: 'Colombo', employmentType: 'intern', locationId: 3 })],
      ['role', () => result.current.role.mutateAsync({ id: 2, role: 'manager' })],
      ['disable', () => result.current.disable.mutateAsync({ id: 2 })],
      ['enable', () => result.current.enable.mutateAsync({ id: 2 })],
    ]

    for (const [name, mutate] of mutations) {
      queryClient.setQueryData([...balancesQueryKey, 'probe', name], 1)
      await act(async () => {
        await mutate()
      })
      expect(queryClient.getQueryState([...balancesQueryKey, 'probe', name])?.isInvalidated).toBe(true)
    }
  })
})
