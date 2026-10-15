import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { request, requestData } from '@/lib/api'
import { adminQueryKey, locationsQueryKey, userQueryKey } from '@/lib/queryKeys'

export const workScheduleSchema = z.object({
  id: z.number(),
  valid_from: z.string(),
  // Solo per l'orario personale: da quella data vale di nuovo l'orario della sede
  follows_location: z.boolean(),
  // Minuti per giorno, lunedì primo
  minutes: z.array(z.number()).length(7),
  // Già in vigore: non si cancella più
  is_started: z.boolean(),
})

export const locationSchema = z.object({
  id: z.number(),
  name: z.string(),
  city: z.string().nullable(),
  country: z.string(),
  timezone: z.string(),
  patron_day: z.number().nullable(),
  patron_month: z.number().nullable(),
  is_primary: z.boolean(),
  archived_at: z.string().nullable(),
  users_count: z.number(),
  // Responsabili attivi: zero mostra l'avviso "Nessun responsabile"
  managers_count: z.number(),
})

export const locationDetailSchema = locationSchema.extend({ current_schedule: workScheduleSchema.nullable() })

export const closureSchema = z.object({
  id: z.number(),
  // null = tutte le sedi
  location_id: z.number().nullable(),
  location_name: z.string().nullable(),
  starts_on: z.string(),
  ends_on: z.string(),
  description: z.string(),
})

const reasonSchema = z.object({ type: z.enum(['weekly_rest', 'national_holiday', 'patron', 'closure']), label: z.string() })

const calendarSchema = z.object({
  data: z.object({
    year: z.number(),
    schedules: z.array(workScheduleSchema),
    days: z.array(z.object({ date: z.string(), reasons: z.array(reasonSchema) })),
  }),
})

const locationOptionSchema = z.object({ id: z.number(), name: z.string(), is_primary: z.boolean() })

const locationListSchema = z.object({
  data: z.array(locationSchema),
  meta: z.object({
    current_page: z.number(),
    last_page: z.number(),
    total: z.number(),
    counts: z.object({ active: z.number(), archived: z.number() }),
  }),
})

const userSchedulesSchema = z.object({
  data: z.object({ schedules: z.array(workScheduleSchema), location_schedule: workScheduleSchema.nullable() }),
})

export type WorkSchedule = z.infer<typeof workScheduleSchema>
export type Location = z.infer<typeof locationSchema>
export type LocationDetail = z.infer<typeof locationDetailSchema>
export type Closure = z.infer<typeof closureSchema>
export type LocationCalendar = z.infer<typeof calendarSchema>['data']
export type CalendarReason = z.infer<typeof reasonSchema>
export type LocationOption = z.infer<typeof locationOptionSchema>
export type LocationList = z.infer<typeof locationListSchema>
export type UserSchedules = z.infer<typeof userSchedulesSchema>['data']

export type LocationStatus = 'active' | 'archived'
export type LocationSort = 'name' | '-name'

export interface LocationListParams {
  status: LocationStatus
  sort: LocationSort
  page: number
}

export interface LocationInput {
  name: string
  city: string
  /** null = nessun patrono */
  patronDay: number | null
  patronMonth: number | null
}

export interface ScheduleInput {
  validFrom: string
  minutes: number[]
}

/** Orario personale: o i minuti, o il ritorno all'orario della sede da quella data */
export type UserScheduleInput = { validFrom: string; minutes: number[] } | { validFrom: string; followsLocation: true }

export interface ClosureInput {
  /** null = tutte le sedi */
  locationId: number | null
  startsOn: string
  endsOn: string
  description: string
}

const detailResponse = z.object({ data: locationDetailSchema })
const scheduleResponse = z.object({ data: workScheduleSchema })
const closureResponse = z.object({ data: closureSchema })

const locationBody = ({ name, city, patronDay, patronMonth }: LocationInput) => ({
  name,
  city: city.trim() === '' ? null : city.trim(),
  patron_day: patronDay,
  patron_month: patronMonth,
})

const closureBody = ({ locationId, startsOn, endsOn, description }: ClosureInput) => ({
  location_id: locationId,
  starts_on: startsOn,
  ends_on: endsOn,
  description,
})

/**
 * Dopo ogni modifica si ricaricano le query admin (sedi, utenti, amministratori) e l'utente corrente: rinominare la
 * propria sede o crearne una seconda cambia profilo e campi Sede. Lo storico no: sedi e orari non scrivono tappe.
 */
const useLocationMutation = <TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    // Anche dopo un errore (es. 409): i dati mostrati potrebbero essere superati
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: adminQueryKey }),
        queryClient.invalidateQueries({ queryKey: userQueryKey }),
      ])
    },
  })
}

export const useLocations = ({ status, sort, page }: LocationListParams) =>
  useQuery({
    queryKey: [...locationsQueryKey, 'list', status, sort, page],
    queryFn: () => {
      const query = new URLSearchParams({ 'filter[status]': status, sort })
      if (page > 1) query.set('page', String(page))
      return requestData('GET', `/api/locations?${query.toString()}`, locationListSchema)
    },
    placeholderData: keepPreviousData,
  })

/** Sedi attive per le select (invito, Modifica, filtro): al massimo 500, ordinate per nome. */
export const useLocationOptions = (enabled = true) =>
  useQuery({
    queryKey: [...locationsQueryKey, 'options'],
    queryFn: async () => (await requestData('GET', '/api/locations/options', z.object({ data: z.array(locationOptionSchema) }))).data,
    enabled,
  })

export const useLocation = (id: number) =>
  useQuery({ queryKey: [...locationsQueryKey, 'detail', id], queryFn: async () => (await requestData('GET', `/api/locations/${id}`, detailResponse)).data })

export const useCreateLocation = () => useLocationMutation((input: LocationInput) => requestData('POST', '/api/locations', detailResponse, locationBody(input)))

export const useUpdateLocation = (id: number) =>
  useLocationMutation((input: LocationInput) => requestData('PATCH', `/api/locations/${id}`, detailResponse, locationBody(input)))

export const useMakePrimaryLocation = () => useLocationMutation((id: number) => requestData('POST', `/api/locations/${id}/primary`, detailResponse))

export const useArchiveLocation = () => useLocationMutation((id: number) => requestData('POST', `/api/locations/${id}/archive`, detailResponse))

export const useRestoreLocation = () => useLocationMutation((id: number) => requestData('POST', `/api/locations/${id}/restore`, detailResponse))

export const useLocationSchedules = (id: number) =>
  useQuery({
    queryKey: [...locationsQueryKey, 'schedules', id],
    queryFn: async () => (await requestData('GET', `/api/locations/${id}/schedules`, z.object({ data: z.array(workScheduleSchema) }))).data,
  })

export const useAddLocationSchedule = (id: number) =>
  useLocationMutation(({ validFrom, minutes }: ScheduleInput) =>
    requestData('POST', `/api/locations/${id}/schedules`, scheduleResponse, { valid_from: validFrom, minutes }),
  )

export const useDeleteLocationSchedule = (id: number) =>
  useLocationMutation((scheduleId: number) => request('DELETE', `/api/locations/${id}/schedules/${scheduleId}`))

export const useLocationCalendar = (id: number, year: number) =>
  useQuery({
    queryKey: [...locationsQueryKey, 'calendar', id, year],
    queryFn: async () => (await requestData('GET', `/api/locations/${id}/calendar?year=${year}`, calendarSchema)).data,
    placeholderData: keepPreviousData,
  })

/** Chiusure dell'anno: con una sede, le sue più quelle di tutte le sedi (spec §4.3). */
export const useClosures = (year: number, locationId: number | null) =>
  useQuery({
    queryKey: [...locationsQueryKey, 'closures', year, locationId],
    queryFn: async () => {
      const query = new URLSearchParams({ year: String(year) })
      if (locationId !== null) query.set('filter[location]', String(locationId))
      return (await requestData('GET', `/api/closures?${query.toString()}`, z.object({ data: z.array(closureSchema) }))).data
    },
    placeholderData: keepPreviousData,
  })

export const useCreateClosure = () => useLocationMutation((input: ClosureInput) => requestData('POST', '/api/closures', closureResponse, closureBody(input)))

export const useUpdateClosure = () =>
  useLocationMutation(({ id, ...input }: ClosureInput & { id: number }) => requestData('PATCH', `/api/closures/${id}`, closureResponse, closureBody(input)))

export const useDeleteClosure = () => useLocationMutation((id: number) => request('DELETE', `/api/closures/${id}`))

export const useUserSchedules = (userId: number) =>
  useQuery({
    queryKey: [...locationsQueryKey, 'user-schedules', userId],
    queryFn: async () => (await requestData('GET', `/api/users/${userId}/schedules`, userSchedulesSchema)).data,
  })

export const useAddUserSchedule = (userId: number) =>
  useLocationMutation((input: UserScheduleInput) =>
    requestData(
      'POST',
      `/api/users/${userId}/schedules`,
      scheduleResponse,
      'followsLocation' in input ? { valid_from: input.validFrom, follows_location: true } : { valid_from: input.validFrom, minutes: input.minutes },
    ),
  )

export const useDeleteUserSchedule = (userId: number) =>
  useLocationMutation((scheduleId: number) => request('DELETE', `/api/users/${userId}/schedules/${scheduleId}`))
