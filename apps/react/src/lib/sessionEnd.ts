import type { QueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { isApiError } from '@/lib/api'
import { sessionEndKey } from '@/lib/queryKeys'

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
 * Conserva il motivo di un 401 ricevuto da una richiesta qualsiasi: il server chiude la sessione alla prima risposta
 * e il controllo dell'utente che segue risponde 401 senza motivo.
 */
export const rememberSessionEnd = (client: QueryClient, error: unknown): void => {
  const reason = sessionEndReasonOf(error)
  if (reason) client.setQueryData(sessionEndKey, reason)
}

export const rememberedSessionEnd = (client: QueryClient): SessionEndReason | null => {
  const value: unknown = client.getQueryData(sessionEndKey)
  return isSessionEndReason(value) ? value : null
}

/** Nuova sessione: il motivo della precedente non vale più. */
export const forgetSessionEnd = (client: QueryClient): void => {
  client.removeQueries({ queryKey: sessionEndKey })
}
