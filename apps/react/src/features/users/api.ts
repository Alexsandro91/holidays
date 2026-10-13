import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { requestData } from '@/lib/api'
import { adminQueryKey } from '@/lib/queryKeys'

export const managedUserSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['employee', 'manager', 'admin']),
  role_label: z.string(),
  status: z.enum(['invited', 'active', 'disabled']),
  status_label: z.string(),
  invitation_expires_at: z.string().nullable(),
  is_current_user: z.boolean(),
})

export type ManagedUser = z.infer<typeof managedUserSchema>

export type UserStatusFilter = 'all' | 'active' | 'invited' | 'disabled'

export interface UserListParams {
  status: UserStatusFilter
  search: string
  page: number
}

const userListSchema = z.object({
  data: z.array(managedUserSchema),
  meta: z.object({
    current_page: z.number(),
    last_page: z.number(),
    per_page: z.number(),
    total: z.number(),
    counts: z.object({ all: z.number(), active: z.number(), invited: z.number(), disabled: z.number() }),
  }),
})

export type UserList = z.infer<typeof userListSchema>

// Chiave tipizzata con un'annotazione: `as const` è vietato dalle regole di progetto
export const usersQueryKey = (params: UserListParams): readonly ['admin', 'users', UserListParams] => [adminQueryKey[0], 'users', params]

const toQueryString = ({ status, search, page }: UserListParams): string => {
  const query = new URLSearchParams()
  if (status !== 'all') query.set('filter[status]', status)
  if (search !== '') query.set('search', search)
  if (page > 1) query.set('page', String(page))
  const text = query.toString()
  return text === '' ? '' : `?${text}`
}

export const fetchUsers = (params: UserListParams): Promise<UserList> => requestData('GET', `/api/users${toQueryString(params)}`, userListSchema)

/** Lista per l'admin: durante il cambio di filtro o pagina restano visibili i dati precedenti. */
export const useManagedUsers = (params: UserListParams) =>
  useQuery({ queryKey: usersQueryKey(params), queryFn: () => fetchUsers(params), placeholderData: keepPreviousData })
