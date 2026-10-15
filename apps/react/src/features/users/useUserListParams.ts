import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import { EMPLOYMENT_TYPES } from '@/features/auth/api'
import {
  DEFAULT_USER_LIST_PARAMS,
  USER_PER_PAGE_OPTIONS,
  type EmploymentTypeFilter,
  type UserListParams,
  type UserPerPage,
  type UserRoleFilter,
  type UserSort,
  type UserSortField,
  type UserStatusFilter,
} from '@/features/users/api'

const STATUSES: UserStatusFilter[] = ['all', 'active', 'invited', 'disabled']
const ROLES: UserRoleFilter[] = ['all', 'employee', 'manager']
const EMPLOYMENT_TYPE_FILTERS: EmploymentTypeFilter[] = ['all', ...EMPLOYMENT_TYPES]
// L'ordinamento per sede si legge dall'URL per tutti, ma vale solo per l'admin con più sedi (vedi withoutLocation)
export const USER_SORT_FIELDS: UserSortField[] = ['last_name', 'first_name', 'email', 'role', 'status', 'location']

export const isStatusFilter = (value: string | null): value is UserStatusFilter => value !== null && STATUSES.some((status) => status === value)

export const isRoleFilter = (value: string | null): value is UserRoleFilter => value !== null && ROLES.some((role) => role === value)

export const isEmploymentTypeFilter = (value: string | null): value is EmploymentTypeFilter =>
  value !== null && EMPLOYMENT_TYPE_FILTERS.some((type) => type === value)

export const isSortField = (value: string): value is UserSortField => USER_SORT_FIELDS.some((field) => field === value)

export const isUserSort = (value: string | null): value is UserSort => value !== null && isSortField(value.startsWith('-') ? value.slice(1) : value)

const toPage = (value: string | null): number => {
  const page = Number.parseInt(value ?? '', 10)
  return Number.isNaN(page) || page < 1 ? 1 : page
}

const toLocation = (value: string | null): number | null => {
  const id = Number.parseInt(value ?? '', 10)
  return Number.isNaN(id) || id < 1 ? null : id
}

const toPerPage = (value: string | null): UserPerPage => USER_PER_PAGE_OPTIONS.find((option) => String(option) === value) ?? DEFAULT_USER_LIST_PARAMS.perPage

// Limite dell'API per i filtri di testo (spec §3): un link più lungo non deve finire in un 422 a ripetizione
export const MAX_TEXT_FILTER = 100

const toText = (value: string | null): string => (value ?? '').slice(0, MAX_TEXT_FILTER)

/** Legge la vista dall'URL: i valori sconosciuti tornano al default (un link vecchio o modificato a mano non rompe la pagina). */
export const parseUserListParams = (search: URLSearchParams): UserListParams => {
  const role = search.get('role')
  const employmentType = search.get('employment_type')
  const status = search.get('status')
  const sort = search.get('sort')
  return {
    search: toText(search.get('search')),
    firstName: toText(search.get('first_name')),
    lastName: toText(search.get('last_name')),
    email: toText(search.get('email')),
    role: isRoleFilter(role) ? role : DEFAULT_USER_LIST_PARAMS.role,
    employmentType: isEmploymentTypeFilter(employmentType) ? employmentType : DEFAULT_USER_LIST_PARAMS.employmentType,
    location: toLocation(search.get('location')),
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
  if (params.employmentType !== DEFAULT_USER_LIST_PARAMS.employmentType) query.set('employment_type', params.employmentType)
  if (params.location !== null) query.set('location', String(params.location))
  if (params.status !== DEFAULT_USER_LIST_PARAMS.status) query.set('status', params.status)
  if (params.sort !== DEFAULT_USER_LIST_PARAMS.sort) query.set('sort', params.sort)
  if (params.page > 1) query.set('page', String(params.page))
  if (params.perPage !== DEFAULT_USER_LIST_PARAMS.perPage) query.set('per_page', String(params.perPage))
  return query
}

/** Filtri del pannello attivi (la ricerca generale e lo stato hanno i loro controlli sempre visibili). */
export const countPanelFilters = ({ firstName, lastName, email, role, employmentType, location }: UserListParams): number =>
  [firstName !== '', lastName !== '', email !== '', role !== 'all', employmentType !== 'all', location !== null].filter(Boolean).length

/** Qualunque filtro attivo, ricerca e stato compresi. */
export const hasAnyFilter = (params: UserListParams): boolean => params.search !== '' || params.status !== 'all' || countPanelFilters(params) > 0

/** Vista senza filtri: ordinamento e righe per pagina restano. */
export const CLEARED_FILTERS: Partial<UserListParams> = {
  search: '',
  firstName: '',
  lastName: '',
  email: '',
  role: 'all',
  employmentType: 'all',
  location: null,
  status: 'all',
  page: 1,
}

/** Vista senza sede (responsabile, o admin con una sola sede): filtro e ordinamento per sede dell'URL non valgono. */
export const withoutLocation = (params: UserListParams): UserListParams => ({
  ...params,
  location: null,
  sort: params.sort === 'location' || params.sort === '-location' ? DEFAULT_USER_LIST_PARAMS.sort : params.sort,
})

/**
 * Filtri, ordinamento e pagina nell'URL: Indietro, Avanti e i link condivisi riportano alla stessa vista.
 * `withLocation` (admin con più sedi) legge anche la sede, ad esempio da "Vedi persone" della lista Sedi (`?location=ID`).
 */
export const useUserListParams = (withLocation = false) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const parsed = parseUserListParams(searchParams)
  const params = withLocation ? parsed : withoutLocation(parsed)

  const setParams = useCallback(
    (next: Partial<UserListParams>, options: { replace?: boolean } = {}) => {
      // Si parte dall'URL corrente, non dal render: due aggiornamenti ravvicinati non si sovrascrivono
      setSearchParams((current) => serializeUserListParams({ ...parseUserListParams(current), ...next }), { replace: options.replace === true })
    },
    [setSearchParams],
  )

  return { params, setParams }
}
