import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import {
  DEFAULT_USER_LIST_PARAMS,
  USER_PER_PAGE_OPTIONS,
  type UserListParams,
  type UserPerPage,
  type UserRoleFilter,
  type UserSort,
  type UserSortField,
  type UserStatusFilter,
} from '@/features/users/api'

const STATUSES: UserStatusFilter[] = ['all', 'active', 'invited', 'disabled']
const ROLES: UserRoleFilter[] = ['all', 'employee', 'manager']
export const USER_SORT_FIELDS: UserSortField[] = ['last_name', 'first_name', 'email', 'role', 'status']

export const isStatusFilter = (value: string | null): value is UserStatusFilter => value !== null && STATUSES.some((status) => status === value)

export const isRoleFilter = (value: string | null): value is UserRoleFilter => value !== null && ROLES.some((role) => role === value)

export const isSortField = (value: string): value is UserSortField => USER_SORT_FIELDS.some((field) => field === value)

export const isUserSort = (value: string | null): value is UserSort => value !== null && isSortField(value.startsWith('-') ? value.slice(1) : value)

const toPage = (value: string | null): number => {
  const page = Number.parseInt(value ?? '', 10)
  return Number.isNaN(page) || page < 1 ? 1 : page
}

const toPerPage = (value: string | null): UserPerPage => USER_PER_PAGE_OPTIONS.find((option) => String(option) === value) ?? DEFAULT_USER_LIST_PARAMS.perPage

// Limite dell'API per i filtri di testo (spec §3): un link più lungo non deve finire in un 422 a ripetizione
export const MAX_TEXT_FILTER = 100

const toText = (value: string | null): string => (value ?? '').slice(0, MAX_TEXT_FILTER)

/** Legge la vista dall'URL: i valori sconosciuti tornano al default (un link vecchio o modificato a mano non rompe la pagina). */
export const parseUserListParams = (search: URLSearchParams): UserListParams => {
  const role = search.get('role')
  const status = search.get('status')
  const sort = search.get('sort')
  return {
    search: toText(search.get('search')),
    firstName: toText(search.get('first_name')),
    lastName: toText(search.get('last_name')),
    email: toText(search.get('email')),
    role: isRoleFilter(role) ? role : DEFAULT_USER_LIST_PARAMS.role,
    status: isStatusFilter(status) ? status : DEFAULT_USER_LIST_PARAMS.status,
    sort: isUserSort(sort) ? sort : DEFAULT_USER_LIST_PARAMS.sort,
    page: toPage(search.get('page')),
    perPage: toPerPage(search.get('per_page')),
  }
}

/** Scrive solo i valori diversi dal default: l'URL resta corto e leggibile. */
export const serializeUserListParams = (params: UserListParams): URLSearchParams => {
  const query = new URLSearchParams()
  const texts: [string, string][] = [
    ['search', params.search],
    ['first_name', params.firstName],
    ['last_name', params.lastName],
    ['email', params.email],
  ]
  texts.forEach(([key, value]) => {
    if (value !== '') query.set(key, value)
  })
  if (params.role !== DEFAULT_USER_LIST_PARAMS.role) query.set('role', params.role)
  if (params.status !== DEFAULT_USER_LIST_PARAMS.status) query.set('status', params.status)
  if (params.sort !== DEFAULT_USER_LIST_PARAMS.sort) query.set('sort', params.sort)
  if (params.page > 1) query.set('page', String(params.page))
  if (params.perPage !== DEFAULT_USER_LIST_PARAMS.perPage) query.set('per_page', String(params.perPage))
  return query
}

/** Filtri del pannello attivi (la ricerca generale e lo stato hanno i loro controlli sempre visibili). */
export const countPanelFilters = ({ firstName, lastName, email, role }: UserListParams): number =>
  [firstName !== '', lastName !== '', email !== '', role !== 'all'].filter(Boolean).length

/** Qualunque filtro attivo, ricerca e stato compresi. */
export const hasAnyFilter = (params: UserListParams): boolean => params.search !== '' || params.status !== 'all' || countPanelFilters(params) > 0

/** Vista senza filtri: ordinamento e righe per pagina restano. */
export const CLEARED_FILTERS: Partial<UserListParams> = { search: '', firstName: '', lastName: '', email: '', role: 'all', status: 'all', page: 1 }

/** Filtri, ordinamento e pagina nell'URL: Indietro, Avanti e i link condivisi riportano alla stessa vista. */
export const useUserListParams = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const params = parseUserListParams(searchParams)

  const setParams = useCallback(
    (next: Partial<UserListParams>, options: { replace?: boolean } = {}) => {
      // Si parte dall'URL corrente, non dal render: due aggiornamenti ravvicinati non si sovrascrivono
      setSearchParams((current) => serializeUserListParams({ ...parseUserListParams(current), ...next }), { replace: options.replace === true })
    },
    [setSearchParams],
  )

  return { params, setParams }
}
