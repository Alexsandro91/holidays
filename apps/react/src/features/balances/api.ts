import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { requestData } from '@/lib/api'
import { balancesQueryKey } from '@/lib/queryKeys'

export const balanceTypeSchema = z.enum(['vacation', 'rol', 'ex_holidays'])

const annualSchema = z.object({ minutes: z.number(), source: z.enum(['company', 'location', 'user']) })

export const balanceSummarySchema = z.object({
  // false: la persona non matura saldi (es. non dipendente senza movimenti)
  applicable: z.boolean(),
  year: z.number(),
  weekly_minutes: z.number(),
  location_weekly_minutes: z.number(),
  average_day_minutes: z.number(),
  last_aligned_on: z.string().nullable(),
  balances: z.array(
    z.object({
      balance: balanceTypeSchema,
      label: z.string(),
      current_minutes: z.number(),
      summary: z.object({ opening: z.number(), accrued: z.number(), used: z.number(), corrections: z.number(), closing: z.number() }),
      annual: annualSchema,
      // 0 per chi oggi non matura, anche se il valore annuo è configurato
      monthly_quota_minutes: z.number(),
      // Usato approvato con data futura, richieste in attesa e quanto resta da chiedere (spec SP2 fase 3 §6)
      planned_minutes: z.number(),
      pending_minutes: z.number(),
      available_minutes: z.number(),
    }),
  ),
  can: z.object({ adjust: z.boolean(), manage_accrual: z.boolean() }),
})

export const balanceMovementSchema = z.object({
  id: z.number(),
  balance: balanceTypeSchema,
  kind: z.enum(['accrual', 'adjustment', 'alignment', 'usage']),
  minutes: z.number(),
  effective_on: z.string(),
  period: z.string().nullable(),
  target_minutes: z.number().nullable(),
  note: z.string().nullable(),
  // Sempre null nel profilo e per le azioni di sistema
  actor_name: z.string().nullable(),
  // Richiesta dei movimenti `usage`; null per gli altri e quando il server non la carica
  leave_request: z
    .object({ id: z.number(), absence_type_name: z.string().nullable(), starts_on: z.string(), ends_on: z.string(), source: z.enum(['request', 'closure']) })
    .nullable(),
  created_at: z.string(),
})

const balanceMinutesSchema = z.object({ current_minutes: z.number(), annual_minutes: z.number() })

export const balanceOverviewRowSchema = z.object({
  user: z.object({
    id: z.number(),
    name: z.string(),
    role: z.string(),
    role_label: z.string(),
    location: z.object({ id: z.number(), name: z.string() }).nullable(),
  }),
  weekly_minutes: z.number(),
  location_weekly_minutes: z.number(),
  average_day_minutes: z.number(),
  balances: z.object({ vacation: balanceMinutesSchema, rol: balanceMinutesSchema, ex_holidays: balanceMinutesSchema }),
  last_aligned_on: z.string().nullable(),
  can: z.object({ adjust: z.boolean() }),
})

const accrualEffectiveSchema = z.object({ minutes: z.number(), source: z.enum(['company', 'location', 'user']) })

export const accrualSchema = z.object({
  // Valori impostati a quel livello: null = eredita (solo sede e persona)
  values: z.object({ vacation_minutes: z.number().nullable(), rol_minutes: z.number().nullable(), ex_holidays_minutes: z.number().nullable() }),
  effective: z.object({ vacation: accrualEffectiveSchema, rol: accrualEffectiveSchema, ex_holidays: accrualEffectiveSchema }),
})

const balancesAtSchema = z.object({
  date: z.string(),
  balances: z.object({ vacation: z.number(), rol: z.number(), ex_holidays: z.number() }),
  last_alignment: z.object({ vacation: z.string().nullable(), rol: z.string().nullable(), ex_holidays: z.string().nullable() }),
})

const alignmentSchema = z.object({
  aligned_on: z.string(),
  deltas: z.object({ vacation: z.number().optional(), rol: z.number().optional(), ex_holidays: z.number().optional() }),
})

const overviewPageSchema = z.object({
  data: z.array(balanceOverviewRowSchema),
  meta: z.object({ current_page: z.number(), last_page: z.number(), total: z.number() }),
})

const movementsPageSchema = z.object({
  data: z.array(balanceMovementSchema),
  meta: z.object({ current_page: z.number(), last_page: z.number() }),
})

export type BalanceType = z.infer<typeof balanceTypeSchema>
export type BalanceSummary = z.infer<typeof balanceSummarySchema>
export type BalanceMovement = z.infer<typeof balanceMovementSchema>
export type BalanceOverviewRow = z.infer<typeof balanceOverviewRowSchema>
export type BalanceOverviewPage = z.infer<typeof overviewPageSchema>
export type Accrual = z.infer<typeof accrualSchema>
export type BalancesAt = z.infer<typeof balancesAtSchema>
export type BalanceAlignment = z.infer<typeof alignmentSchema>

export const BALANCE_TYPES: readonly BalanceType[] = balanceTypeSchema.options

export type BalanceOverviewSort = 'name' | '-name' | 'location' | '-location'

export interface BalanceOverviewParams {
  search: string
  onlyNegative: boolean
  /** Solo l'admin; null = tutte le sedi */
  locationId: number | null
  sort: BalanceOverviewSort
  page: number
}

export interface BalanceMovementFilters {
  /** Assente = tutti i saldi */
  balance?: BalanceType
  year: number
}

export interface AdjustBalanceInput {
  balance: BalanceType
  /** Minuti con segno, mai 0 */
  minutes: number
  note: string
}

export interface AlignBalancesInput {
  alignedOn: string
  /** Minuti a quella data, solo per i saldi indicati */
  values: Partial<Record<BalanceType, number>>
  note?: string | null
}

/** Valori annui in minuti: per l'azienda sempre numeri, per sede e persona null = eredita. */
export interface AccrualValuesInput {
  vacation_minutes: number | null
  rol_minutes: number | null
  ex_holidays_minutes: number | null
}

const nextPage = (last: z.infer<typeof movementsPageSchema>): number | undefined => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined)

const movementsQuery = (filters: BalanceMovementFilters, page: number): string => {
  const query = new URLSearchParams({ year: String(filters.year), page: String(page) })
  if (filters.balance !== undefined) query.set('balance', filters.balance)
  return query.toString()
}

/** Pagina Saldi: 25 persone per pagina con filtri e ordinamento (spec §7.2). */
export const useBalanceOverview = ({ search, onlyNegative, locationId, sort, page }: BalanceOverviewParams) =>
  useQuery({
    queryKey: [...balancesQueryKey, 'overview', { search, onlyNegative, locationId, sort, page }],
    queryFn: () => {
      const query = new URLSearchParams({ sort })
      if (search.trim() !== '') query.set('filter[search]', search.trim())
      if (onlyNegative) query.set('filter[negative]', '1')
      if (locationId !== null) query.set('filter[location]', String(locationId))
      if (page > 1) query.set('page', String(page))
      return requestData('GET', `/api/balances?${query.toString()}`, overviewPageSchema)
    },
    placeholderData: keepPreviousData,
  })

export const useUserBalances = (userId: number, year: number) =>
  useQuery({
    queryKey: [...balancesQueryKey, 'user', userId, 'summary', year],
    queryFn: async () => (await requestData('GET', `/api/users/${userId}/balances?year=${year}`, z.object({ data: balanceSummarySchema }))).data,
    placeholderData: keepPreviousData,
  })

/** Movimenti di una persona, 20 per pagina dal più recente. */
export const useUserBalanceMovements = (userId: number, filters: BalanceMovementFilters) =>
  useInfiniteQuery({
    queryKey: [...balancesQueryKey, 'user', userId, 'movements', filters],
    queryFn: ({ pageParam }) => requestData('GET', `/api/users/${userId}/balance-movements?${movementsQuery(filters, pageParam)}`, movementsPageSchema),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  })

export const useProfileBalances = (year: number) =>
  useQuery({
    queryKey: [...balancesQueryKey, 'profile', 'summary', year],
    queryFn: async () => (await requestData('GET', `/api/profile/balances?year=${year}`, z.object({ data: balanceSummarySchema }))).data,
    placeholderData: keepPreviousData,
  })

export const useProfileBalanceMovements = (filters: BalanceMovementFilters) =>
  useInfiniteQuery({
    queryKey: [...balancesQueryKey, 'profile', 'movements', filters],
    queryFn: ({ pageParam }) => requestData('GET', `/api/profile/balance-movements?${movementsQuery(filters, pageParam)}`, movementsPageSchema),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  })

/** Saldi in app a una data (YYYY-MM-DD) e ultimo allineamento per saldo: anteprima di "Allinea alla busta paga". */
export const useBalancesAt = (userId: number, date: string | null) =>
  useQuery({
    queryKey: [...balancesQueryKey, 'user', userId, 'at', date],
    queryFn: async () => (await requestData('GET', `/api/users/${userId}/balances/at?date=${date ?? ''}`, z.object({ data: balancesAtSchema }))).data,
    enabled: date !== null && date !== '',
  })

/** Dopo ogni correzione si ricaricano tutti i saldi (scheda, pagina Saldi, profilo), anche dopo un errore. */
const useBalanceMutation = <TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: balancesQueryKey }),
  })
}

export const useAdjustBalance = (userId: number) =>
  useBalanceMutation(async ({ balance, minutes, note }: AdjustBalanceInput) =>
    (await requestData('POST', `/api/users/${userId}/balance-adjustments`, z.object({ data: balanceMovementSchema }), { balance, minutes, note })).data,
  )

export const useAlignBalances = (userId: number) =>
  useBalanceMutation(async ({ alignedOn, values, note }: AlignBalancesInput) =>
    (
      await requestData('POST', `/api/users/${userId}/balance-alignments`, z.object({ data: alignmentSchema }), {
        aligned_on: alignedOn,
        values,
        note: note === undefined || note === null || note.trim() === '' ? null : note.trim(),
      })
    ).data,
  )

const accrualResponse = z.object({ data: accrualSchema })

// I valori annui stanno sotto balancesQueryKey: invalidare i saldi ricarica anche loro
export const useCompanyAccrual = () =>
  useQuery({ queryKey: [...balancesQueryKey, 'accrual', 'company'], queryFn: async () => (await requestData('GET', '/api/settings/accrual', accrualResponse)).data })

export const useUpdateCompanyAccrual = () =>
  useBalanceMutation(async (values: AccrualValuesInput) => (await requestData('PATCH', '/api/settings/accrual', accrualResponse, values)).data)

export const useLocationAccrual = (locationId: number) =>
  useQuery({
    queryKey: [...balancesQueryKey, 'accrual', 'location', locationId],
    queryFn: async () => (await requestData('GET', `/api/locations/${locationId}/accrual`, accrualResponse)).data,
  })

export const useUpdateLocationAccrual = (locationId: number) =>
  useBalanceMutation(async (values: AccrualValuesInput) => (await requestData('PUT', `/api/locations/${locationId}/accrual`, accrualResponse, values)).data)

export const useUserAccrual = (userId: number) =>
  useQuery({
    queryKey: [...balancesQueryKey, 'accrual', 'user', userId],
    queryFn: async () => (await requestData('GET', `/api/users/${userId}/accrual`, accrualResponse)).data,
  })

export const useUpdateUserAccrual = (userId: number) =>
  useBalanceMutation(async (values: AccrualValuesInput) => (await requestData('PUT', `/api/users/${userId}/accrual`, accrualResponse, values)).data)
