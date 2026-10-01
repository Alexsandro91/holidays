import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { useCurrentUser } from '@/features/auth/api'
import { APP_NAME } from '@/lib/appName'
import { useRouteTitleKey } from '@/lib/routeTitle'

/** A ogni cambio di pagina: titolo del documento, focus sull'h1 e annuncio per i lettori di schermo. */
const RouteAnnouncer = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const titleKey = useRouteTitleKey()
  const title = titleKey ? t(titleKey) : null

  const { isPending } = useCurrentUser()

  // Annuncio fissato al cambio di indirizzo: un cambio di lingua aggiorna il titolo ma non riannuncia la pagina
  const announcement = title ? t('a11y.pageAnnouncement', { title }) : ''
  const [announced, setAnnounced] = useState({ pathname: location.pathname, text: announcement })
  if (announced.pathname !== location.pathname) {
    setAnnounced({ pathname: location.pathname, text: announcement })
  }

  // Titolo del documento: dipende solo dal titolo, così un cambio di lingua non sposta il focus
  useEffect(() => {
    if (title) document.title = `${title} · ${APP_NAME}`
  }, [title])

  // Focus sull'h1: solo a guardia sbloccata, altrimenti l'h1 non esiste ancora (loader di GuestRoute/ProtectedRoute)
  useEffect(() => {
    if (isPending) return
    const frame = window.requestAnimationFrame(() => {
      // Se la pagina ha già portato il focus su un campo (es. il codice di verifica), non glielo togliamo
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      document.getElementById('page-title')?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.pathname, isPending])

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {announced.text}
    </div>
  )
}

export default RouteAnnouncer
