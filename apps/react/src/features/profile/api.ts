import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { currentUserResponseSchema, type User } from '@/features/auth/api'
import { request, requestData } from '@/lib/api'
import i18n, { type Locale } from '@/lib/i18n'
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
    // Solo i campi del nome: la lingua ha il suo salvataggio, magari ancora in corso
    onSuccess: (updated) => {
      queryClient.setQueryData<User | null>(userQueryKey, (current) =>
        current ? { ...current, first_name: updated.first_name, last_name: updated.last_name, name: updated.name, session: updated.session } : current,
      )
    },
  })
}

export interface LocaleChange {
  locale: Locale
  /** Conferma con un toast verde (dalla pagina Profilo); dal menu in alto solo l'eventuale errore */
  confirm: boolean
}

/**
 * Lingua dell'account. `scope` mette i salvataggi in fila: con due cambi rapidi il secondo parte dopo la risposta al
 * primo, così sull'account resta l'ultima scelta. Toast nelle opzioni della mutation e non di `mutate`: partono anche
 * se chi ha cambiato lingua non è più montato (es. si è usciti dal profilo).
 */
export const useUpdateProfileLocale = () => {
  const queryClient = useQueryClient()
  return useMutation({
    scope: { id: 'profile-locale' },
    mutationFn: ({ locale }: LocaleChange) => updateProfile({ locale }),
    onSuccess: (updated, { confirm }) => {
      queryClient.setQueryData<User | null>(userQueryKey, (current) => (current ? { ...current, locale: updated.locale, session: updated.session } : current))
      // i18n.t e non il t del render: il messaggio va nella lingua appena scelta
      if (confirm) toast.success(i18n.t('profile.preferences.localeDone'))
    },
    // Se il salvataggio fallisce l'interfaccia resta nella lingua scelta; al prossimo caricamento vince l'account
    onError: () => toast.error(i18n.t('preferences.localeSaveError')),
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
