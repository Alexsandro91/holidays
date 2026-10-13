import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { requestData } from '@/lib/api'
import { adminQueryKey } from '@/lib/queryKeys'
import { managedUserSchema, type ManagedRole } from '@/features/users/api'

const listSchema = z.object({ data: z.array(managedUserSchema) })
const resourceSchema = z.object({ data: managedUserSchema })

// Chiave tipizzata con un'annotazione: `as const` è vietato dalle regole di progetto
export const administratorsQueryKey: readonly ['admin', 'administrators'] = [adminQueryKey[0], 'administrators']

export const useAdministrators = () =>
  useQuery({ queryKey: administratorsQueryKey, queryFn: async () => (await requestData('GET', '/api/administrators', listSchema)).data })

export interface GrantAdminInput {
  userId: number
  currentPassword: string
}

export interface RevokeAdminInput {
  id: number
  role: ManagedRole
  currentPassword: string
}

export const useGrantAdmin = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, currentPassword }: GrantAdminInput) =>
      requestData('POST', '/api/administrators', resourceSchema, { user_id: userId, current_password: currentPassword }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminQueryKey }),
  })
}

export const useRevokeAdmin = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, role, currentPassword }: RevokeAdminInput) =>
      requestData('DELETE', `/api/administrators/${id}`, resourceSchema, { role, current_password: currentPassword }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminQueryKey }),
  })
}
