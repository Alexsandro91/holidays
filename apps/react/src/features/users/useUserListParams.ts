import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type { UserListParams, UserStatusFilter } from '@/features/users/api'

const STATUSES: UserStatusFilter[] = ['all', 'active', 'invited', 'disabled']

const isStatus = (value: string | null): value is UserStatusFilter => value !== null && STATUSES.some((status) => status === value)

const toPage = (value: string | null): number => {
  const page = Number.parseInt(value ?? '', 10)
  return Number.isNaN(page) || page < 1 ? 1 : page
}

/** Filtro, ricerca e pagina nell'URL: "indietro" e i link condivisi riportano alla stessa vista. */
export const useUserListParams = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const status = searchParams.get('status')
  const params: UserListParams = {
    status: isStatus(status) ? status : 'all',
    search: searchParams.get('q') ?? '',
    page: toPage(searchParams.get('page')),
  }

  const setParams = useCallback(
    (next: Partial<UserListParams>) => {
      setSearchParams((current) => {
        const currentStatus = current.get('status')
        const merged: UserListParams = {
          status: next.status ?? (isStatus(currentStatus) ? currentStatus : 'all'),
          search: next.search ?? current.get('q') ?? '',
          page: next.page ?? toPage(current.get('page')),
        }
        const query = new URLSearchParams()
        if (merged.status !== 'all') query.set('status', merged.status)
        if (merged.search !== '') query.set('q', merged.search)
        if (merged.page > 1) query.set('page', String(merged.page))
        return query
      })
    },
    [setSearchParams],
  )

  return { params, setParams }
}
