import { useMutation, useQueryClient } from '@tanstack/react-query'
import { currentUserResponseSchema, type User } from '@/features/auth/api'
import { requestData } from '@/lib/api'
import type { Locale } from '@/lib/i18n'
import { userQueryKey } from '@/lib/queryKeys'

/** Campi di `PATCH /api/profile`, tutti facoltativi (spec fase 4 §2.2). */
export interface ProfileInput {
  first_name?: string
  last_name?: string
  locale?: Locale
}

const updateProfile = (input: ProfileInput): Promise<User> => requestData('PATCH', '/api/profile', currentUserResponseSchema, input)

/** Lingua dell'account. La cache si aggiorna prima della richiesta (vedi useAccountLocale). */
export const useUpdateProfileLocale = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (locale: Locale) => updateProfile({ locale }),
    // La risposta aggiorna solo i limiti della sessione: con due cambi rapidi una risposta in ritardo non riporta indietro la lingua
    onSuccess: (updated) => {
      queryClient.setQueryData<User | null>(userQueryKey, (current) => (current ? { ...current, session: updated.session } : current))
    },
  })
}
