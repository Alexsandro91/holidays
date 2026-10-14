import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { request, requestData } from '@/lib/api'
import type { User } from '@/features/auth/api'
import { adminQueryKey, userQueryKey } from '@/lib/queryKeys'

export const managedUserSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string(),
  // Nome completo ("Nome Cognome") per la visualizzazione
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
    update: z.boolean(),
  }),
})

export type ManagedUser = z.infer<typeof managedUserSchema>

export type UserRole = ManagedUser['role']
export type UserStatus = ManagedUser['status']
export type UserStatusFilter = 'all' | UserStatus
/** Gli admin non sono nella lista Utenti (si gestiscono in Amministratori): il filtro ha solo gli altri ruoli */
export type UserRoleFilter = 'all' | Exclude<UserRole, 'admin'>
export type UserSortField = 'last_name' | 'first_name' | 'email' | 'role' | 'status'
/** Campo di ordinamento, con il prefisso `-` per l'ordine decrescente (contratto API, spec §7.2) */
export type UserSort = UserSortField | `-${UserSortField}`
export type UserPerPage = 10 | 25 | 50

export const USER_PER_PAGE_OPTIONS: UserPerPage[] = [10, 25, 50]

/** Stato completo della lista: filtri, ordinamento e pagina (nell'URL, vedi useUserListParams). */
export interface UserListParams {
  /** Ricerca generale: ogni parola in nome, cognome o email */
  search: string
  firstName: string
  lastName: string
  email: string
  role: UserRoleFilter
  status: UserStatusFilter
  sort: UserSort
  page: number
  perPage: UserPerPage
}

export const DEFAULT_USER_LIST_PARAMS: UserListParams = {
  search: '',
  firstName: '',
  lastName: '',
  email: '',
  role: 'all',
  status: 'all',
  sort: 'last_name',
  page: 1,
  perPage: 25,
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

/** Parametri dell'API: `filter[...]`, `sort`, `page` e `per_page` (spec §3 e §7.2). I testi vuoti non si inviano. */
const toQueryString = ({ search, firstName, lastName, email, role, status, sort, page, perPage }: UserListParams): string => {
  const query = new URLSearchParams()
  const texts: [string, string][] = [
    ['filter[search]', search],
    ['filter[first_name]', firstName],
    ['filter[last_name]', lastName],
    ['filter[email]', email],
  ]
  texts.forEach(([key, value]) => {
    if (value.trim() !== '') query.set(key, value.trim())
  })
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
  firstName: string
  lastName: string
  email: string
  role: ManagedRole
}

const userResourceSchema = z.object({ data: managedUserSchema })

/** Dopo ogni modifica si ricaricano tutte le query admin (lista utenti, amministratori, conteggi). */
const useAdminMutation = <TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>, onSuccess?: (result: TResult) => void) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess,
    // Variabili (password di conferma comprese) fuori dalla cache appena il dialog si chiude
    gcTime: 0,
    // Anche dopo un errore (es. 409): l'elenco mostrato potrebbe essere superato
    onSettled: () => queryClient.invalidateQueries({ queryKey: adminQueryKey }),
  })
}

export const useInviteUser = () =>
  useAdminMutation(({ firstName, lastName, email, role }: InviteUserInput) =>
    requestData('POST', '/api/users', userResourceSchema, { first_name: firstName, last_name: lastName, email, role }),
  )

export const useResendInvitation = () => useAdminMutation((id: number) => request('POST', `/api/users/${id}/invitation`))

export const useCancelInvitation = () => useAdminMutation((id: number) => request('DELETE', `/api/users/${id}/invitation`))

export const useChangeRole = () =>
  useAdminMutation(({ id, role }: { id: number; role: ManagedRole }) => requestData('PATCH', `/api/users/${id}/role`, userResourceSchema, { role }))

export interface UpdateUserInput {
  id: number
  firstName: string
  lastName: string
  /** Solo per gli utenti invitati: per gli altri l'email non cambia (spec §7.3) */
  email?: string
  /** Solo per modificare un altro admin */
  currentPassword?: string
}

export const useUpdateUser = () => {
  const queryClient = useQueryClient()
  return useAdminMutation(
    ({ id, firstName, lastName, email, currentPassword }: UpdateUserInput) =>
      requestData('PATCH', `/api/users/${id}`, userResourceSchema, {
        first_name: firstName,
        last_name: lastName,
        ...(email === undefined ? {} : { email }),
        ...(currentPassword === undefined ? {} : { current_password: currentPassword }),
      }),
    // Modificando sé stessi cambia anche il nome del menu account: si aggiorna subito l'utente corrente
    ({ data }) => {
      queryClient.setQueryData<User | null>(userQueryKey, (current) => (current && current.id === data.id ? { ...current, name: data.name } : current))
    },
  )
}

export interface UserStatusInput {
  id: number
  currentPassword?: string
}

const statusBody = ({ currentPassword }: UserStatusInput) => (currentPassword === undefined ? undefined : { current_password: currentPassword })

export const useDisableUser = () =>
  useAdminMutation((input: UserStatusInput) => requestData('POST', `/api/users/${input.id}/disable`, userResourceSchema, statusBody(input)))

export const useEnableUser = () =>
  useAdminMutation((input: UserStatusInput) => requestData('POST', `/api/users/${input.id}/enable`, userResourceSchema, statusBody(input)))
