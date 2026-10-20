import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { request, requestData } from '@/lib/api'
import { absenceTypesQueryKey } from '@/lib/queryKeys'
import { balanceTypeSchema } from '@/features/balances/api'

const employmentTypeSchema = z.enum(['employee', 'contractor', 'intern'])
const limitUnitSchema = z.enum(['days', 'hours'])
const limitPeriodSchema = z.enum(['month', 'year', 'request'])

export const absenceTypeSchema = z.object({
  id: z.number(),
  // null per i tipi creati dall'admin
  code: z.string().nullable(),
  // Nome da mostrare: quello personalizzato o la traduzione del tipo di partenza
  name: z.string(),
  // Nome salvato; null = tipo di partenza col nome tradotto
  custom_name: z.string().nullable(),
  is_system: z.boolean(),
  allows_days: z.boolean(),
  allows_half_days: z.boolean(),
  allows_hours: z.boolean(),
  balance: balanceTypeSchema.nullable(),
  requires_approval: z.boolean(),
  employment_types: z.array(employmentTypeSchema),
  requires_enablement: z.boolean(),
  day_count: z.enum(['working', 'calendar']),
  requires_certificate: z.boolean(),
  limit: z.object({ amount: z.number(), unit: limitUnitSchema, period: limitPeriodSchema }).nullable(),
  position: z.number(),
  archived_at: z.string().nullable(),
  // Solo nella lista admin, e solo per i tipi con abilitazione
  enabled_users_count: z.number().nullable().optional(),
})

const absenceTypeListSchema = z.object({
  data: z.array(absenceTypeSchema),
  meta: z.object({ counts: z.object({ active: z.number(), archived: z.number() }) }),
})

const absenceTypeOptionSchema = z.object({
  id: z.number(),
  name: z.string(),
  requires_enablement: z.boolean(),
  enabled: z.boolean(),
})

export type AbsenceType = z.infer<typeof absenceTypeSchema>
export type AbsenceTypeList = z.infer<typeof absenceTypeListSchema>
export type AbsenceTypeOption = z.infer<typeof absenceTypeOptionSchema>
export type AbsenceTypeStatus = 'active' | 'archived'

export interface AbsenceTypeInput {
  /** Nei tipi di partenza null ripristina il nome tradotto */
  name: string | null
  allowsDays: boolean
  allowsHalfDays: boolean
  allowsHours: boolean
  balance: z.infer<typeof balanceTypeSchema> | null
  requiresApproval: boolean
  employmentTypes: z.infer<typeof employmentTypeSchema>[]
  requiresEnablement: boolean
  dayCount: 'working' | 'calendar'
  requiresCertificate: boolean
  /** null = nessun limite */
  limit: { amount: number; unit: 'days' | 'hours'; period: 'month' | 'year' | 'request' } | null
}

const typeResponse = z.object({ data: absenceTypeSchema })

/** Solo i campi presenti: in modifica il server accetta campi parziali. */
const typeBody = (input: Partial<AbsenceTypeInput>): Record<string, unknown> => {
  const fields: [string, unknown][] = [
    ['name', input.name],
    ['allows_days', input.allowsDays],
    ['allows_half_days', input.allowsHalfDays],
    ['allows_hours', input.allowsHours],
    ['balance', input.balance],
    ['requires_approval', input.requiresApproval],
    ['employment_types', input.employmentTypes],
    ['requires_enablement', input.requiresEnablement],
    ['day_count', input.dayCount],
    ['requires_certificate', input.requiresCertificate],
    ['limit', input.limit],
  ]
  return Object.fromEntries(fields.filter(([, value]) => value !== undefined))
}

/** Dopo ogni modifica si ricaricano tipi, abilitazioni ed elenco del profilo, anche dopo un errore. */
const useAbsenceTypeMutation = <TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: absenceTypesQueryKey }),
  })
}

/** Elenco non paginato (al massimo 200) con i conteggi di attivi e archiviati. */
export const useAbsenceTypes = (status: AbsenceTypeStatus) =>
  useQuery({
    queryKey: [...absenceTypesQueryKey, 'list', status],
    queryFn: () => requestData('GET', `/api/absence-types?filter[status]=${status}`, absenceTypeListSchema),
  })

export const useCreateAbsenceType = () =>
  useAbsenceTypeMutation(async (input: AbsenceTypeInput) => (await requestData('POST', '/api/absence-types', typeResponse, typeBody(input))).data)

export const useUpdateAbsenceType = () =>
  useAbsenceTypeMutation(async ({ id, ...input }: Partial<AbsenceTypeInput> & { id: number }) =>
    (await requestData('PATCH', `/api/absence-types/${id}`, typeResponse, typeBody(input))).data,
  )

export const useArchiveAbsenceType = () =>
  useAbsenceTypeMutation(async (id: number) => (await requestData('POST', `/api/absence-types/${id}/archive`, typeResponse)).data)

export const useRestoreAbsenceType = () =>
  useAbsenceTypeMutation(async (id: number) => (await requestData('POST', `/api/absence-types/${id}/restore`, typeResponse)).data)

/** Nuovo ordine dei tipi attivi: tutti gli id, nell'ordine voluto. */
export const useReorderAbsenceTypes = () => useAbsenceTypeMutation((ids: number[]) => request('PUT', '/api/absence-types/order', { ids }))

const optionsResponse = z.object({ data: z.array(absenceTypeOptionSchema) })

/** Tipi che valgono per il rapporto della persona, con l'abilitazione attuale (solo admin). */
export const useUserAbsenceTypes = (userId: number) =>
  useQuery({
    queryKey: [...absenceTypesQueryKey, 'user', userId],
    queryFn: async () => (await requestData('GET', `/api/users/${userId}/absence-types`, optionsResponse)).data,
  })

/** Sostituisce le abilitazioni della persona: gli id dei tipi con abilitazione da accendere. */
export const useUpdateUserEnablements = (userId: number) =>
  useAbsenceTypeMutation((typeIds: number[]) => request('PUT', `/api/users/${userId}/absence-type-enablements`, { absence_type_ids: typeIds }))

/** Tipi che chi è collegato può usare (senza abilitazione, o abilitati). */
export const useProfileAbsenceTypes = () =>
  useQuery({
    queryKey: [...absenceTypesQueryKey, 'profile'],
    queryFn: async () => (await requestData('GET', '/api/profile/absence-types', optionsResponse)).data,
  })
