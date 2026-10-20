import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { request, requestData } from '@/lib/api'
import { locationRefSchema, type EmploymentType, type User } from '@/features/auth/api'
import { adminQueryKey, historyQueryKey, userQueryKey } from '@/lib/queryKeys'

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
  // Sede e tipo di rapporto (spec SP2 fase 1 §4.5 e §7.4)
  location: locationRefSchema,
  employment_type: z.enum(['employee', 'contractor', 'intern']),
  employment_type_label: z.string(),
  // Azioni permesse a chi guarda, calcolate dal server (spec §2): il frontend non ricalcola le regole dei ruoli
  can: z.object({
    resend_invitation: z.boolean(),
    cancel_invitation: z.boolean(),
    change_role: z.boolean(),
    disable: z.boolean(),
    enable: z.boolean(),
    update: z.boolean(),
    // Link di reset della password all'email della persona (spec fase 4 §6)
    send_password_reset: z.boolean(),
    // Solo l'admin cambia la sede e l'orario personale; storico per admin e responsabile (spec SP2 fase 1 §4.4, §8.3)
    change_location: z.boolean(),
    manage_schedule: z.boolean(),
    view_history: z.boolean(),
    // Saldi: vederli, rettificarli e allinearli, gestire i tipi di assenza e le abilitazioni (spec SP2 fase 2 §8)
    view_balances: z.boolean(),
    adjust_balances: z.boolean(),
    manage_absence_types: z.boolean(),
  }),
})

export type ManagedUser = z.infer<typeof managedUserSchema>

export type UserRole = ManagedUser['role']
export type UserStatus = ManagedUser['status']
export type UserStatusFilter = 'all' | UserStatus
/** Gli admin non sono nella lista Utenti (si gestiscono in Amministratori): il filtro ha solo gli altri ruoli */
export type UserRoleFilter = 'all' | Exclude<UserRole, 'admin'>
/** "Tutti i tipi" o un tipo di rapporto (spec SP2 fase 1 §7.4) */
export type EmploymentTypeFilter = 'all' | EmploymentType
export type UserSortField = 'last_name' | 'first_name' | 'email' | 'role' | 'status' | 'location'
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
  /** Tipo di rapporto, per admin e responsabili */
  employmentType: EmploymentTypeFilter
  /** Id della sede: solo per l'admin con più sedi (spec §4.5), altrimenti null */
  location: number | null
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
  employmentType: 'all',
  location: null,
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
const toQueryString = ({ search, firstName, lastName, email, role, employmentType, location, status, sort, page, perPage }: UserListParams): string => {
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
  if (employmentType !== 'all') query.set('filter[employment_type]', employmentType)
  if (location !== null) query.set('filter[location]', String(location))
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
  employmentType: EmploymentType
  /** Solo l'admin con più sedi la sceglie; senza, il server usa la sede di chi invita o la principale */
  locationId?: number
}

const userResourceSchema = z.object({ data: managedUserSchema })

/**
 * Dopo ogni modifica si ricaricano tutte le query admin (lista utenti, amministratori, conteggi) e lo storico: invito,
 * ruolo, tipo, sede e stato aggiungono tappe, che il dialog Storico deve mostrare subito e non dopo lo staleTime.
 */
const useAdminMutation = <TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>, onSuccess?: (result: TResult) => void) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess,
    // Variabili (password di conferma comprese) fuori dalla cache appena il dialog si chiude
    gcTime: 0,
    // Anche dopo un errore (es. 409): l'elenco mostrato potrebbe essere superato
    onSettled: () => Promise.all([queryClient.invalidateQueries({ queryKey: adminQueryKey }), queryClient.invalidateQueries({ queryKey: historyQueryKey })]),
  })
}

export const useInviteUser = () =>
  useAdminMutation(({ firstName, lastName, email, role, employmentType, locationId }: InviteUserInput) =>
    requestData('POST', '/api/users', userResourceSchema, {
      first_name: firstName,
      last_name: lastName,
      email,
      role,
      employment_type: employmentType,
      ...(locationId === undefined ? {} : { location_id: locationId }),
    }),
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
  /** Solo se cambia */
  employmentType?: EmploymentType
  /** Solo se cambia, e solo l'admin (can.change_location) */
  locationId?: number
  /** Solo per modificare un altro admin */
  currentPassword?: string
}

export const useUpdateUser = () => {
  const queryClient = useQueryClient()
  return useAdminMutation(
    ({ id, firstName, lastName, email, employmentType, locationId, currentPassword }: UpdateUserInput) =>
      requestData('PATCH', `/api/users/${id}`, userResourceSchema, {
        first_name: firstName,
        last_name: lastName,
        ...(email === undefined ? {} : { email }),
        ...(employmentType === undefined ? {} : { employment_type: employmentType }),
        ...(locationId === undefined ? {} : { location_id: locationId }),
        ...(currentPassword === undefined ? {} : { current_password: currentPassword }),
      }),
    // Modificando sé stessi cambiano anche menu account e profilo: si aggiorna subito l'utente corrente
    ({ data }) => {
      queryClient.setQueryData<User | null>(userQueryKey, (current) =>
        current && current.id === data.id
          ? {
              ...current,
              first_name: data.first_name,
              last_name: data.last_name,
              name: data.name,
              employment_type: data.employment_type,
              employment_type_label: data.employment_type_label,
              location: data.location,
            }
          : current,
      )
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

/** Link di reset della password all'email registrata della persona: 202 senza corpo (spec fase 4 §6.2). */
export const useSendPasswordReset = () =>
  useAdminMutation((input: UserStatusInput) => request('POST', `/api/users/${input.id}/password-reset`, statusBody(input)))
