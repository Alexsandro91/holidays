import { useMutation, useQueryClient } from '@tanstack/react-query'
import { currentUserResponseSchema, type User } from '@/features/auth/api'
import { request, requestData } from '@/lib/api'
import type { Locale } from '@/lib/i18n'
import { userQueryKey } from '@/lib/queryKeys'

/** Campi di `PATCH /api/profile`, tutti facoltativi (spec fase 4 §2.2). */
export interface ProfileInput {
  first_name?: string
  last_name?: string
  locale?: Locale
}

const updateProfile = (input: ProfileInput): Promise<User> => requestData('PATCH', '/api/profile', currentUserResponseSchema, input)

/** Nome e cognome di chi è collegato: salvati, aggiornano subito il menu account (sidebar). */
export const useUpdateProfileName = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ firstName, lastName }: { firstName: string; lastName: string }) => updateProfile({ first_name: firstName, last_name: lastName }),
    // Solo i campi del nome: la lingua in cache è quella scelta, anche se un suo salvataggio è ancora in corso
    onSuccess: (updated) => {
      queryClient.setQueryData<User | null>(userQueryKey, (current) =>
        current ? { ...current, first_name: updated.first_name, last_name: updated.last_name, name: updated.name, session: updated.session } : current,
      )
    },
  })
}

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

export interface PasswordChangeInput {
  currentPassword: string
  password: string
  confirmation: string
}

/** Cambio della propria password: 204, le altre sessioni si chiudono (spec fase 4 §2.3). */
export const useChangePassword = () =>
  useMutation({
    mutationFn: ({ currentPassword, password, confirmation }: PasswordChangeInput) =>
      request('PUT', '/api/profile/password', { current_password: currentPassword, password, password_confirmation: confirmation }),
    // Le password inviate non restano nella cache delle mutation
    gcTime: 0,
  })
