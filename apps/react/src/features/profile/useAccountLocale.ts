import { useCallback, useEffect, useRef } from 'react'
import { useUpdateProfileLocale } from '@/features/profile/api'
import i18n, { setLocale, type Locale } from '@/lib/i18n'

/**
 * Lingua dell'account come lingua dell'interfaccia (spec fase 4 §3.1): una volta per sessione, al login o al primo
 * caricamento, se diversa da quella attiva l'interfaccia la adotta e la salva anche nel browser. Le riletture successive
 * dell'utente (focus della finestra, "Resta collegato") non la riportano indietro: dopo un cambio non salvato
 * l'interfaccia resta nella lingua scelta fino al prossimo caricamento.
 */
export const useSyncAccountLocale = (userId: number | undefined, locale: Locale | undefined): void => {
  // Utente per cui la lingua è già stata applicata; si azzera quando la sessione finisce
  const syncedUserId = useRef<number | null>(null)

  useEffect(() => {
    if (userId === undefined || locale === undefined) {
      syncedUserId.current = null
      return
    }
    if (syncedUserId.current === userId) return
    syncedUserId.current = userId
    if (locale !== i18n.language) void setLocale(locale)
  }, [userId, locale])
}

interface ChangeLocaleOptions {
  /** Toast verde a salvataggio riuscito (dalla pagina Profilo) */
  confirm?: boolean
}

/**
 * Cambio di lingua da collegati: l'interfaccia cambia subito e la scelta si salva sull'account. Se il salvataggio
 * fallisce compare un errore e l'interfaccia resta nella lingua scelta (vedi useUpdateProfileLocale).
 */
export const useChangeAccountLocale = () => {
  const { mutate } = useUpdateProfileLocale()

  return useCallback(
    (locale: Locale, { confirm = false }: ChangeLocaleOptions = {}) => {
      void setLocale(locale)
      mutate({ locale, confirm })
    },
    [mutate],
  )
}
