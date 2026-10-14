import { type QueryClient, skipToken, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { isApiError } from '@/lib/api'
import { isUserQuery, sessionEndKey } from '@/lib/queryKeys'

/** Motivo della chiusura della sessione da parte del server, come compare nell'avviso del login (`?reason=`). */
export type SessionEndReason = 'disabled' | 'expired'

const sessionEndMetaSchema = z.object({ reason: z.enum(['account_disabled', 'session_expired']) })

const isSessionEndReason = (value: unknown): value is SessionEndReason => value === 'disabled' || value === 'expired'

/** Motivo di un 401 (`meta.reason`): null se la risposta non lo dice (nessuna sessione). */
export const sessionEndReasonOf = (error: unknown): SessionEndReason | null => {
  if (!isApiError(error, 'unauthenticated')) return null
  const meta = sessionEndMetaSchema.safeParse(error.meta)
  if (!meta.success) return null
  return meta.data.reason === 'account_disabled' ? 'disabled' : 'expired'
}

/**
 * Dati della sessione chiusa: query non dell'utente (lista utenti, amministratori…) e mutation concluse, che tengono
 * le variabili inviate comprese le password di conferma. Non devono restare per chi usa il browser dopo.
 */
export const clearSessionData = (client: QueryClient): void => {
  client.removeQueries({ predicate: (query) => !isUserQuery(query.queryKey) })
  client.getMutationCache().clear()
}

/**
 * Il server ha chiuso la sessione (401 con motivo): si puliscono i dati come al logout e si conserva il motivo, perché
 * il controllo dell'utente che segue risponde 401 senza motivo. L'utente in cache resta: le route protette lo vedono
 * insieme all'errore e mostrano il motivo invece di "sei uscito".
 *
 * La voce non ha osservatori fuori dalla pagina di accesso: TanStack la rimuove al più dopo il gcTime (5 minuti), e
 * comunque la cancella la prima rilettura riuscita dell'utente (vedi queryClient.ts).
 */
export const rememberSessionEnd = (client: QueryClient, error: unknown): void => {
  const reason = sessionEndReasonOf(error)
  if (!reason) return
  clearSessionData(client)
  client.setQueryData(sessionEndKey, reason)
}

export const rememberedSessionEnd = (client: QueryClient): SessionEndReason | null => {
  const value: unknown = client.getQueryData(sessionEndKey)
  return isSessionEndReason(value) ? value : null
}

/** Motivo conservato, aggiornato anche se arriva dopo il render (risposte in parallelo). Solo lettura dalla cache. */
export const useRememberedSessionEnd = (): SessionEndReason | null => {
  const { data } = useQuery({ queryKey: sessionEndKey, queryFn: skipToken })
  return isSessionEndReason(data) ? data : null
}

/** Nuova sessione: il motivo della precedente non vale più. */
export const forgetSessionEnd = (client: QueryClient): void => {
  client.removeQueries({ queryKey: sessionEndKey })
}
