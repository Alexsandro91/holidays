import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { request, requestData } from '@/lib/api'
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

export type ManagedRole = 'employee' | 'manager'

export interface InviteUserInput {
  name: string
  email: string
  role: ManagedRole
}

const userResourceSchema = z.object({ data: managedUserSchema })

/** Dopo ogni modifica si ricaricano tutte le query admin (lista utenti, amministratori, conteggi). */
const useAdminMutation = <TInput>(mutationFn: (input: TInput) => Promise<unknown>) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    // Variabili (password di conferma comprese) fuori dalla cache appena il dialog si chiude
    gcTime: 0,
    // Anche dopo un errore (es. 409): l'elenco mostrato potrebbe essere superato
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminQueryKey }),
  })
}

export const useInviteUser = () => useAdminMutation((input: InviteUserInput) => requestData('POST', '/api/users', userResourceSchema, input))

export const useResendInvitation = () => useAdminMutation((id: number) => request('POST', `/api/users/${id}/invitation`))

export const useCancelInvitation = () => useAdminMutation((id: number) => request('DELETE', `/api/users/${id}/invitation`))

export const useChangeRole = () =>
  useAdminMutation(({ id, role }: { id: number; role: ManagedRole }) => requestData('PATCH', `/api/users/${id}/role`, userResourceSchema, { role }))

export interface UserStatusInput {
  id: number
  currentPassword?: string
}

const statusBody = ({ currentPassword }: UserStatusInput) => (currentPassword === undefined ? undefined : { current_password: currentPassword })

export const useDisableUser = () =>
  useAdminMutation((input: UserStatusInput) => requestData('POST', `/api/users/${input.id}/disable`, userResourceSchema, statusBody(input)))

export const useEnableUser = () =>
  useAdminMutation((input: UserStatusInput) => requestData('POST', `/api/users/${input.id}/enable`, userResourceSchema, statusBody(input)))
