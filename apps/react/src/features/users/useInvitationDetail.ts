import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ManagedUser } from '@/features/users/api'

/** Testo sulla scadenza dell'invito ("Invito scade il …" o "Invito scaduto"); vuoto per chi non è invitato. */
export const useInvitationDetail = () => {
  const { t, i18n } = useTranslation()
  // Istante di riferimento fissato al montaggio: il render resta puro
  const [now] = useState(() => Date.now())

  return useCallback(
    (user: ManagedUser): string => {
      if (user.status !== 'invited') return ''
      // Invito senza scadenza: cancellato dalla pulizia degli inviti scaduti da oltre 30 giorni, va reinviato
      if (user.invitation_expires_at === null) return t('users.inviteExpired')
      const expires = new Date(user.invitation_expires_at)
      if (expires.getTime() <= now) return t('users.inviteExpired')
      return t('users.inviteExpires', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(expires) })
    },
    [t, i18n.language, now],
  )
}
