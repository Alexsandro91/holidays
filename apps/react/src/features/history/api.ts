import { useInfiniteQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { requestData } from '@/lib/api'
import { historyQueryKey } from '@/lib/queryKeys'

export const historyEntrySchema = z.object({
  id: z.number(),
  event: z.enum(['imported', 'invited', 'activated', 'role_changed', 'employment_type_changed', 'location_changed', 'disabled', 'enabled']),
  // Testo della tappa già tradotto dal server ("Ruolo: Utente → Responsabile")
  summary: z.string(),
  // Chi ha agito: solo nella vista di admin e responsabili, null nel profilo e per le azioni di sistema
  actor_name: z.string().nullable(),
  occurred_at: z.string(),
})

export type HistoryEntry = z.infer<typeof historyEntrySchema>

const pageSchema = z.object({
  data: z.array(historyEntrySchema),
  meta: z.object({ current_page: z.number(), last_page: z.number() }),
})

type HistoryPage = z.infer<typeof pageSchema>

const nextPage = (last: HistoryPage): number | undefined => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined)

/** Storico di chi è collegato, 20 tappe per pagina dalla più recente (spec SP2 fase 1 §8.3). */
export const useProfileHistory = () =>
  useInfiniteQuery({
    queryKey: [...historyQueryKey, 'profile'],
    queryFn: ({ pageParam }) => requestData('GET', `/api/profile/history?page=${pageParam}`, pageSchema),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  })

/** Storico di una persona per admin e responsabili, con chi ha agito. Fuori dalla propria sede il server risponde 404. */
export const useUserHistory = (userId: number) =>
  useInfiniteQuery({
    queryKey: [...historyQueryKey, 'user', userId],
    queryFn: ({ pageParam }) => requestData('GET', `/api/users/${userId}/history?page=${pageParam}`, pageSchema),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  })
