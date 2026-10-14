import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import type { User } from '@/features/auth/api'
import { useUpdateProfileLocale } from '@/features/profile/api'
import i18n, { setLocale, type Locale } from '@/lib/i18n'
import { userQueryKey } from '@/lib/queryKeys'

/**
 * Lingua dell'account come lingua dell'interfaccia (spec fase 4 §3.1): al caricamento con una sessione valida e dopo
 * l'accesso, se diversa da quella attiva, l'interfaccia la adotta e la salva anche nel browser.
 */
export const useSyncAccountLocale = (locale: Locale | undefined): void => {
  useEffect(() => {
    if (locale && locale !== i18n.language) void setLocale(locale)
  }, [locale])
}

interface ChangeLocaleOptions {
  onSuccess?: () => void
}

/**
 * Cambio di lingua da collegati: l'interfaccia cambia subito e la scelta si salva sull'account. Se il salvataggio
 * fallisce compare un errore e l'interfaccia resta nella lingua scelta; al caricamento successivo vince l'account.
 */
export const useChangeAccountLocale = () => {
  const queryClient = useQueryClient()
  const { mutate } = useUpdateProfileLocale()

  return useCallback(
    (locale: Locale, options: ChangeLocaleOptions = {}) => {
      // Prima la cache: la sincronizzazione con l'account non deve riportare indietro la scelta
      queryClient.setQueryData<User | null>(userQueryKey, (current) => (current ? { ...current, locale } : current))
      void setLocale(locale)
      mutate(locale, {
        onSuccess: options.onSuccess,
        // i18n.t e non il t del render: il messaggio va nella lingua appena scelta
        onError: () => toast.error(i18n.t('preferences.localeSaveError')),
      })
    },
    [queryClient, mutate],
  )
}
