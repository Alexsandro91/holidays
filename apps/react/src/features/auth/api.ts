import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { isApiError, request, requestData } from '@/lib/api'
import { userQueryKey } from '@/lib/queryKeys'
import { clearSessionData, forgetSessionEnd } from '@/lib/sessionEnd'

export const userSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string(),
  // Nome completo ("Nome Cognome") per la visualizzazione
  name: z.string(),
  email: z.string(),
  role: z.enum(['employee', 'manager', 'admin']),
  role_label: z.string(),
  status: z.enum(['invited', 'active', 'disabled']),
  locale: z.enum(['it', 'en']),
  last_login_at: z.string().nullable(),
})

/** Limiti della sessione in millisecondi del dispositivo, ricavati da `meta.session` alla lettura (spec fase 4 §3.3). */
export interface SessionLimits {
  idleTimeoutMs: number
  /** Istante (`Date.now()`) della scadenza assoluta: lettura + secondi restanti, così l'orologio misura solo il tempo trascorso */
  absoluteDeadline: number
}

/** Utente corrente. `session` c'è solo dopo una lettura di `/api/auth/user` o `/api/profile` (la risposta del codice non la ha). */
export type User = z.infer<typeof userSchema> & { session?: SessionLimits }

const userResponseSchema = z.object({ data: userSchema })

/** Risposta di `GET /api/auth/user` e `PATCH /api/profile`: l'utente con i limiti della sessione. */
export const currentUserResponseSchema = z
  .object({
    data: userSchema,
    meta: z.object({ session: z.object({ idle_timeout_seconds: z.number(), absolute_remaining_seconds: z.number() }) }),
  })
  .transform(({ data, meta }): User => ({
    ...data,
    session: {
      idleTimeoutMs: meta.session.idle_timeout_seconds * 1000,
      absoluteDeadline: Date.now() + Math.max(0, meta.session.absolute_remaining_seconds) * 1000,
    },
  }))

/** Metadati degli errori sul codice restituiti da Laravel. */
export const codeErrorMetaSchema = z.object({
  attempts_left: z.number().optional(),
  restart: z.boolean().optional(),
  limit_reached: z.boolean().optional(),
})

export interface LoginInput {
  email: string
  password: string
}

const fetchCurrentUser = (): Promise<User> => requestData('GET', '/api/auth/user', currentUserResponseSchema)

/** Utente corrente. `null` = logout esplicito; errore 401 = nessuna sessione (o sessione scaduta). */
export const useCurrentUser = () =>
  useQuery<User | null>({ queryKey: userQueryKey, queryFn: fetchCurrentUser, retry: false, staleTime: 5 * 60_000 })

/** Rilegge subito l'utente corrente (anche senza componenti che lo osservano) e aggiorna la cache. */
export const useRefreshCurrentUser = () => {
  const queryClient = useQueryClient()
  return () => queryClient.fetchQuery({ queryKey: userQueryKey, queryFn: fetchCurrentUser, staleTime: 0 })
}

export const useLogin = () => useMutation({ mutationFn: (input: LoginInput) => request('POST', '/api/auth/login', input) })

export const useVerifyCode = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => (await requestData('POST', '/api/auth/two-factor', userResponseSchema, { code })).data,
    onSuccess: (user) => {
      forgetSessionEnd(queryClient)
      queryClient.setQueryData(userQueryKey, user)
      // La risposta del codice non ha i limiti della sessione: si rilegge l'utente per l'avviso di scadenza
      void queryClient.invalidateQueries({ queryKey: userQueryKey })
    },
  })
}

export const useResendCode = () => useMutation({ mutationFn: () => request('POST', '/api/auth/two-factor/resend') })

export const useForgotPassword = () =>
  useMutation({ mutationFn: (email: string) => request('POST', '/api/auth/forgot-password', { email }) })

export interface ResetPasswordInput {
  token: string
  email: string
  password: string
  password_confirmation: string
}

export const useResetPassword = () =>
  useMutation({ mutationFn: (input: ResetPasswordInput) => request('POST', '/api/auth/reset-password', input) })

/** Errori del logout che significano "sessione già chiusa": per l'utente l'uscita è comunque riuscita. */
export const isAlreadySignedOut = (error: unknown): boolean => isApiError(error, 'unauthenticated') || isApiError(error, 'csrf')

export const useLogout = () => {
  const queryClient = useQueryClient()
  const signOut = () => {
    // Dati dell'area admin o di altri utenti e mutation con le password di conferma: non devono restare
    clearSessionData(queryClient)
    // null (e non "nessun dato"): le route protette mostrano l'avviso di uscita
    queryClient.setQueryData(userQueryKey, null)
  }
  return useMutation({
    mutationFn: () => request('POST', '/api/auth/logout'),
    onSuccess: signOut,
    onError: (error) => {
      // Su altri errori (rete, 5xx) la sessione potrebbe essere ancora attiva: l'utente resta dentro
      if (isAlreadySignedOut(error)) signOut()
    },
  })
}
