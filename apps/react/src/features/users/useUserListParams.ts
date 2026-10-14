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
const ROLES: UserRoleFilter[] = ['all', 'employee', 'manager', 'admin']
export const USER_SORT_FIELDS: UserSortField[] = ['name', 'email', 'role', 'status']

export const isStatusFilter = (value: string | null): value is UserStatusFilter => value !== null && STATUSES.some((status) => status === value)

export const isRoleFilter = (value: string | null): value is UserRoleFilter => value !== null && ROLES.some((role) => role === value)

export const isSortField = (value: string): value is UserSortField => USER_SORT_FIELDS.some((field) => field === value)

export const isUserSort = (value: string | null): value is UserSort => value !== null && isSortField(value.startsWith('-') ? value.slice(1) : value)

const toPage = (value: string | null): number => {
  const page = Number.parseInt(value ?? '', 10)
  return Number.isNaN(page) || page < 1 ? 1 : page
}

const toPerPage = (value: string | null): UserPerPage => USER_PER_PAGE_OPTIONS.find((option) => String(option) === value) ?? DEFAULT_USER_LIST_PARAMS.perPage

/** Legge la vista dall'URL: i valori sconosciuti tornano al default (un link vecchio o modificato a mano non rompe la pagina). */
export const parseUserListParams = (search: URLSearchParams): UserListParams => {
  const role = search.get('role')
  const status = search.get('status')
  const sort = search.get('sort')
  return {
    name: search.get('name') ?? '',
    email: search.get('email') ?? '',
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
  if (params.name !== '') query.set('name', params.name)
  if (params.email !== '') query.set('email', params.email)
  if (params.role !== DEFAULT_USER_LIST_PARAMS.role) query.set('role', params.role)
  if (params.status !== DEFAULT_USER_LIST_PARAMS.status) query.set('status', params.status)
  if (params.sort !== DEFAULT_USER_LIST_PARAMS.sort) query.set('sort', params.sort)
  if (params.page > 1) query.set('page', String(params.page))
  if (params.perPage !== DEFAULT_USER_LIST_PARAMS.perPage) query.set('per_page', String(params.perPage))
  return query
}

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
