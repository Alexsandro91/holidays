import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { isApiError, request, requestData } from '@/lib/api'
import { userQueryKey } from '@/lib/queryKeys'

export const userSchema = z.object({
  id: z.number(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['employee', 'manager', 'admin']),
  role_label: z.string(),
  status: z.enum(['invited', 'active', 'disabled']),
  locale: z.enum(['it', 'en']),
  last_login_at: z.string().nullable(),
})

export type User = z.infer<typeof userSchema>

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

const fetchCurrentUser = async (): Promise<User> => (await requestData('GET', '/api/auth/user', userResponseSchema)).data

/** Utente corrente. `null` = logout esplicito; errore 401 = nessuna sessione (o sessione scaduta). */
export const useCurrentUser = () =>
  useQuery<User | null>({ queryKey: userQueryKey, queryFn: fetchCurrentUser, retry: false, staleTime: 5 * 60_000 })

export const useLogin = () => useMutation({ mutationFn: (input: LoginInput) => request('POST', '/api/auth/login', input) })

export const useVerifyCode = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (code: string) => (await requestData('POST', '/api/auth/two-factor', userResponseSchema, { code })).data,
    onSuccess: (user) => {
      queryClient.setQueryData(userQueryKey, user)
    },
  })
}

export const useResendCode = () => useMutation({ mutationFn: () => request('POST', '/api/auth/two-factor/resend') })

/** Errori del logout che significano "sessione già chiusa": per l'utente l'uscita è comunque riuscita. */
export const isAlreadySignedOut = (error: unknown): boolean => isApiError(error, 'unauthenticated') || isApiError(error, 'csrf')

export const useLogout = () => {
  const queryClient = useQueryClient()
  // null (e non "nessun dato"): le route protette mostrano l'avviso di uscita
  const signOut = () => queryClient.setQueryData(userQueryKey, null)
  return useMutation({
    mutationFn: () => request('POST', '/api/auth/logout'),
    onSuccess: signOut,
    onError: (error) => {
      // Su altri errori (rete, 5xx) la sessione potrebbe essere ancora attiva: l'utente resta dentro
      if (isAlreadySignedOut(error)) signOut()
    },
  })
}
