import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { balanceTypeSchema } from '@/features/balances/api'
import { requestData } from '@/lib/api'
import { balancesQueryKey, leaveQueryKey, userQueryKey } from '@/lib/queryKeys'

export const leaveRequestStatusSchema = z.enum(['pending', 'approved', 'rejected', 'withdrawn', 'cancellation_requested', 'cancelled'])
export const leaveUnitSchema = z.enum(['days', 'half_day', 'hours'])
export const dayHalfSchema = z.enum(['morning', 'afternoon'])

/** Avviso calcolato dal server: il testo lo compone il frontend dal codice e dai parametri. */
export const leaveWarningSchema = z.object({
  code: z.string(),
  params: z.record(z.string(), z.union([z.number(), z.string()])),
})

const leaveDaySchema = z.object({ date: z.string(), minutes: z.number() })

export const leaveRequestSchema = z.object({
  id: z.number(),
  user: z.object({ id: z.number(), name: z.string() }),
  absence_type: z.object({ id: z.number(), name: z.string(), balance: balanceTypeSchema.nullable() }),
  unit: leaveUnitSchema,
  starts_on: z.string(),
  ends_on: z.string(),
  half: dayHalfSchema.nullable(),
  // Orari "HH:MM", solo per le ore
  starts_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  minutes: z.number(),
  working_days: z.number(),
  status: leaveRequestStatusSchema,
  status_label: z.string(),
  note: z.string().nullable(),
  decision_note: z.string().nullable(),
  decided_by_name: z.string().nullable(),
  decided_at: z.string().nullable(),
  cancellation_requested_at: z.string().nullable(),
  cancelled_by_name: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  source: z.enum(['request', 'closure']),
  can: z.object({
    withdraw: z.boolean(),
    request_cancellation: z.boolean(),
    approve: z.boolean(),
    reject: z.boolean(),
    approve_cancellation: z.boolean(),
    reject_cancellation: z.boolean(),
    cancel: z.boolean(),
  }),
  // Solo nel dettaglio
  days: z.array(leaveDaySchema).optional(),
  // Solo in creazione e in Da approvare
  warnings: z.array(leaveWarningSchema).optional(),
})

export const leavePreviewSchema = z.object({
  days: z.array(leaveDaySchema),
  minutes: z.number(),
  working_days: z.number(),
  // null per i tipi senza saldo
  balance: z.object({ balance: balanceTypeSchema, current_minutes: z.number(), available_minutes: z.number(), after_minutes: z.number() }).nullable(),
  warnings: z.array(leaveWarningSchema),
})

export const profileCalendarSchema = z.object({
  // `minutes` è 0 nei giorni non lavorativi, con i motivi (`type` è il tipo del calendario, `label` il testo)
  days: z.array(z.object({ date: z.string(), minutes: z.number(), reasons: z.array(z.object({ type: z.string(), label: z.string() })) })),
  requests: z.array(leaveRequestSchema),
})

const dataOf = <T extends z.ZodType>(schema: T) => z.object({ data: schema })

const myRequestsPageSchema = z.object({
  data: z.array(leaveRequestSchema),
  meta: z.object({ current_page: z.number(), last_page: z.number() }),
})

const approvalsSchema = z.object({ data: z.array(leaveRequestSchema), meta: z.object({ count: z.number() }) })

export type LeaveRequestStatus = z.infer<typeof leaveRequestStatusSchema>
export type LeaveUnit = z.infer<typeof leaveUnitSchema>
export type DayHalf = z.infer<typeof dayHalfSchema>
export type LeaveWarning = z.infer<typeof leaveWarningSchema>
export type LeaveRequest = z.infer<typeof leaveRequestSchema>
export type LeavePreview = z.infer<typeof leavePreviewSchema>
export type ProfileCalendar = z.infer<typeof profileCalendarSchema>
export type Approvals = z.infer<typeof approvalsSchema>

export const LEAVE_REQUEST_STATUSES: readonly LeaveRequestStatus[] = leaveRequestStatusSchema.options

/** Bozza di una richiesta: gli stessi campi di anteprima e creazione. */
export interface LeaveDraftInput {
  absence_type_id: number
  unit: LeaveUnit
  starts_on: string
  ends_on: string
  half?: DayHalf
  /** "HH:MM", solo per le ore */
  starts_at?: string
  ends_at?: string
  note?: string
}

export type LeaveAction = 'withdraw' | 'cancellation' | 'approve' | 'reject' | 'approve_cancellation' | 'reject_cancellation' | 'cancel'

export interface LeaveActionInput {
  id: number
  action: LeaveAction
  /** Solo per `reject`: il motivo facoltativo (`decision_note`) */
  note?: string | null
}

const ACTION_PATHS: Record<LeaveAction, string> = {
  withdraw: 'withdraw',
  cancellation: 'cancellation',
  approve: 'approve',
  reject: 'reject',
  approve_cancellation: 'cancellation/approve',
  reject_cancellation: 'cancellation/reject',
  cancel: 'cancel',
}

const nextPage = (last: z.infer<typeof myRequestsPageSchema>): number | undefined => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined)

/** Calendario personale dell'intervallo (YYYY-MM-DD, al massimo 366 giorni): giorni con minuti e motivi, e le proprie richieste che lo toccano. */
export const useProfileCalendar = (from: string, to: string) =>
  useQuery({
    queryKey: [...leaveQueryKey, 'calendar', from, to],
    queryFn: async () => (await requestData('GET', `/api/profile/calendar?${new URLSearchParams({ from, to }).toString()}`, dataOf(profileCalendarSchema))).data,
    placeholderData: keepPreviousData,
  })

/** Le mie richieste dell'anno, dalla più recente, 20 per pagina. */
export const useMyLeaveRequests = (year: number) =>
  useInfiniteQuery({
    queryKey: [...leaveQueryKey, 'mine', year],
    queryFn: ({ pageParam }) => requestData('GET', `/api/leave-requests?${new URLSearchParams({ year: String(year), page: String(pageParam) }).toString()}`, myRequestsPageSchema),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  })

/** Dettaglio con i giorni; `null` = nessuna richiesta aperta, nessuna lettura. */
export const useLeaveRequest = (id: number | null) =>
  useQuery({
    queryKey: [...leaveQueryKey, 'detail', id],
    queryFn: async () => (await requestData('GET', `/api/leave-requests/${id ?? 0}`, dataOf(leaveRequestSchema))).data,
    enabled: id !== null,
  })

/** Anteprima di una bozza completa (POST, nessuna scrittura); con `null` non parte. */
export const useLeavePreview = (draft: LeaveDraftInput | null) =>
  useQuery({
    queryKey: [...leaveQueryKey, 'preview', draft],
    queryFn: async () => (await requestData('POST', '/api/leave-requests/preview', dataOf(leavePreviewSchema), draft)).data,
    enabled: draft !== null,
    placeholderData: keepPreviousData,
  })

/** Da approvare: richieste e annullamenti in attesa, dalla più vecchia; `locationId` solo per l'admin. */
export const useApprovals = (locationId?: number | null) =>
  useQuery({
    queryKey: [...leaveQueryKey, 'approvals', locationId ?? null],
    queryFn: () => {
      const query = new URLSearchParams()
      if (locationId !== undefined && locationId !== null) query.set('filter[location]', String(locationId))
      const suffix = query.toString()
      return requestData('GET', suffix === '' ? '/api/approvals' : `/api/approvals?${suffix}`, approvalsSchema)
    },
    placeholderData: keepPreviousData,
  })

/** Dopo ogni scrittura si ricaricano richieste, saldi e l'utente (contatore Da approvare), anche dopo un errore. */
const useLeaveMutation = <TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: leaveQueryKey }),
        queryClient.invalidateQueries({ queryKey: balancesQueryKey }),
        queryClient.invalidateQueries({ queryKey: userQueryKey }),
      ]),
  })
}

export const useCreateLeaveRequest = () =>
  useLeaveMutation(async (draft: LeaveDraftInput) => (await requestData('POST', '/api/leave-requests', dataOf(leaveRequestSchema), draft)).data)

export const useLeaveAction = () =>
  useLeaveMutation(async ({ id, action, note }: LeaveActionInput) => {
    const body = action === 'reject' && note !== undefined && note !== null && note.trim() !== '' ? { decision_note: note.trim() } : undefined
    return (await requestData('POST', `/api/leave-requests/${id}/${ACTION_PATHS[action]}`, dataOf(leaveRequestSchema), body)).data
  })
