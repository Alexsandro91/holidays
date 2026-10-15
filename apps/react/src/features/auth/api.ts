import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { isApiError, request, requestData } from '@/lib/api'
import { userQueryKey } from '@/lib/queryKeys'
import { clearSessionData, forgetSessionEnd } from '@/lib/sessionEnd'

/** Tipo di rapporto (spec SP2 fase 1 §7): diverso dal ruolo, che dice cosa si può fare nell'app. */
export type EmploymentType = 'employee' | 'contractor' | 'intern'

export const EMPLOYMENT_TYPES: EmploymentType[] = ['employee', 'contractor', 'intern']

export const isEmploymentType = (value: string): value is EmploymentType => EMPLOYMENT_TYPES.some((type) => type === value)

/** Sede di una persona come la manda il server: id e nome attuale. */
export const locationRefSchema = z.object({ id: z.number(), name: z.string() })

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
  location: locationRefSchema,
  employment_type: z.enum(['employee', 'contractor', 'intern']),
  employment_type_label: z.string(),
})

/** Limiti della sessione in millisecondi del dispositivo, ricavati da `meta.session` alla lettura (spec fase 4 §3.3). */
export interface SessionLimits {
  idleTimeoutMs: number
  /** Istante (`Date.now()`) della scadenza assoluta: lettura + secondi restanti, così l'orologio misura solo il tempo trascorso */
  absoluteDeadline: number
}

/** Utente corrente. `session` e `multipleLocations` ci sono solo dopo una lettura di `/api/auth/user` o `/api/profile`. */
export type User = z.infer<typeof userSchema> & {
  session?: SessionLimits
  /** Almeno due sedi attive (spec §5.5): senza, i campi Sede non compaiono */
  multipleLocations?: boolean
}

/** Risposta di `GET /api/auth/user` e `PATCH /api/profile`: l'utente, i limiti della sessione e il numero di sedi. */
export const currentUserResponseSchema = z
  .object({
    data: userSchema,
    meta: z.object({
      session: z.object({ idle_timeout_seconds: z.number(), absolute_remaining_seconds: z.number() }),
      multiple_locations: z.boolean(),
    }),
  })
  .transform(({ data, meta }): User => ({
    ...data,
    session: {
      idleTimeoutMs: meta.session.idle_timeout_seconds * 1000,
      absoluteDeadline: Date.now() + Math.max(0, meta.session.absolute_remaining_seconds) * 1000,
    },
    multipleLocations: meta.multiple_locations,
  }))

const userResponseSchema = z.object({ data: userSchema })

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

/** true con almeno due sedi attive. Prima della lettura (o dopo la sola risposta del codice) vale una sede sola. */
export const useMultipleLocations = (): boolean => {
  const { data } = useCurrentUser()
  return data?.multipleLocations ?? false
}

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
