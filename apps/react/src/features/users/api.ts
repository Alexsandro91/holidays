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
  // Azioni permesse a chi guarda, calcolate dal server (spec §2): il frontend non ricalcola le regole dei ruoli
  can: z.object({
    resend_invitation: z.boolean(),
    cancel_invitation: z.boolean(),
    change_role: z.boolean(),
    disable: z.boolean(),
    enable: z.boolean(),
  }),
})

export type ManagedUser = z.infer<typeof managedUserSchema>

export type UserRole = ManagedUser['role']
export type UserStatus = ManagedUser['status']
export type UserStatusFilter = 'all' | UserStatus
export type UserRoleFilter = 'all' | UserRole
export type UserSortField = 'name' | 'email' | 'role' | 'status'
/** Campo di ordinamento, con il prefisso `-` per l'ordine decrescente (contratto API, spec §3) */
export type UserSort = UserSortField | `-${UserSortField}`
export type UserPerPage = 10 | 25 | 50

export const USER_PER_PAGE_OPTIONS: UserPerPage[] = [10, 25, 50]

/** Stato completo della lista: filtri, ordinamento e pagina (nell'URL, vedi useUserListParams). */
export interface UserListParams {
  name: string
  email: string
  role: UserRoleFilter
  status: UserStatusFilter
  sort: UserSort
  page: number
  perPage: UserPerPage
}

export const DEFAULT_USER_LIST_PARAMS: UserListParams = { name: '', email: '', role: 'all', status: 'all', sort: 'name', page: 1, perPage: 25 }

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

/** Parametri dell'API: `filter[...]`, `sort`, `page` e `per_page` (spec §3). I testi vuoti non si inviano. */
const toQueryString = ({ name, email, role, status, sort, page, perPage }: UserListParams): string => {
  const query = new URLSearchParams()
  if (name.trim() !== '') query.set('filter[name]', name.trim())
  if (email.trim() !== '') query.set('filter[email]', email.trim())
  if (role !== 'all') query.set('filter[role]', role)
  if (status !== 'all') query.set('filter[status]', status)
  query.set('sort', sort)
  if (page > 1) query.set('page', String(page))
  query.set('per_page', String(perPage))
  return `?${query.toString()}`
}

export const fetchUsers = (params: UserListParams): Promise<UserList> => requestData('GET', `/api/users${toQueryString(params)}`, userListSchema)

/** Lista per responsabili e admin: durante il cambio di filtro, ordinamento o pagina restano visibili i dati precedenti. */
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
