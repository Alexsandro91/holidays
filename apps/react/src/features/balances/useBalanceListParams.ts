import { useCallback } from 'react'
import { useSearchParams } from 'react-router'
import type { BalanceOverviewSort } from '@/features/balances/api'

export interface BalanceListParams {
  search: string
  onlyNegative: boolean
  /** Solo l'admin con più sedi; null = tutte */
  location: number | null
  sort: BalanceOverviewSort
  page: number
}

export const DEFAULT_BALANCE_LIST_PARAMS: BalanceListParams = { search: '', onlyNegative: false, location: null, sort: 'name', page: 1 }

const SORTS: readonly BalanceOverviewSort[] = ['name', '-name', 'location', '-location']

// Limite dell'API per il testo di ricerca: un link più lungo non deve finire in un 422
const MAX_SEARCH = 100

const isSort = (value: string | null): value is BalanceOverviewSort => SORTS.some((sort) => sort === value)

const toPositive = (value: string | null): number | null => {
  const number = Number.parseInt(value ?? '', 10)
  return Number.isNaN(number) || number < 1 ? null : number
}

/** Legge la vista dall'URL: i valori sconosciuti tornano al default. */
export const parseBalanceListParams = (query: URLSearchParams): BalanceListParams => {
  const sort = query.get('sort')
  return {
    search: (query.get('search') ?? '').slice(0, MAX_SEARCH),
    onlyNegative: query.get('negative') === '1',
    location: toPositive(query.get('location')),
    sort: isSort(sort) ? sort : DEFAULT_BALANCE_LIST_PARAMS.sort,
    page: toPositive(query.get('page')) ?? 1,
  }
}

/** Scrive solo i valori diversi dal default. */
export const serializeBalanceListParams = (params: BalanceListParams): URLSearchParams => {
  const query = new URLSearchParams()
  if (params.search !== '') query.set('search', params.search)
  if (params.onlyNegative) query.set('negative', '1')
  if (params.location !== null) query.set('location', String(params.location))
  if (params.sort !== DEFAULT_BALANCE_LIST_PARAMS.sort) query.set('sort', params.sort)
  if (params.page > 1) query.set('page', String(params.page))
  return query
}

/** Vista senza sede (responsabile, o admin con una sola sede): filtro e ordinamento per sede dell'URL non valgono. */
export const withoutLocation = (params: BalanceListParams): BalanceListParams => ({
  ...params,
  location: null,
  sort: params.sort === 'location' || params.sort === '-location' ? DEFAULT_BALANCE_LIST_PARAMS.sort : params.sort,
})

/** Filtri, ordinamento e pagina nell'URL: Indietro, Avanti e i link condivisi riportano alla stessa vista. */
export const useBalanceListParams = (withLocation = false) => {
  const [searchParams, setSearchParams] = useSearchParams()
  const parsed = parseBalanceListParams(searchParams)
  const params = withLocation ? parsed : withoutLocation(parsed)

  const setParams = useCallback(
    (next: Partial<BalanceListParams>, options: { replace?: boolean } = {}) => {
      // Si parte dall'URL corrente, non dal render: due aggiornamenti ravvicinati non si sovrascrivono
      setSearchParams((current) => serializeBalanceListParams({ ...parseBalanceListParams(current), ...next }), { replace: options.replace === true })
    },
    [setSearchParams],
  )

  return { params, setParams }
}
