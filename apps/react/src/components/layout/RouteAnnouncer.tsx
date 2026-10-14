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
    let observer: MutationObserver | null = null
    const focusTitle = (title: HTMLElement) => {
      // Se la pagina ha già portato il focus su un campo (es. il codice di verifica), non glielo togliamo
      const active = document.activeElement
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return
      title.focus({ preventScroll: true })
    }
    const frame = window.requestAnimationFrame(() => {
      const title = document.getElementById('page-title')
      if (title) {
        focusTitle(title)
        return
      }
      // Pagina caricata a richiesta ancora in arrivo (fallback di Suspense): il focus va al titolo appena compare
      observer = new MutationObserver(() => {
        const appeared = document.getElementById('page-title')
        if (!appeared) return
        observer?.disconnect()
        // Nel frattempo l'utente ha spostato il focus (es. con Tab): resta dov'è
        if (document.activeElement !== document.body) return
        focusTitle(appeared)
      })
      observer.observe(document.body, { childList: true, subtree: true })
    })
    return () => {
      window.cancelAnimationFrame(frame)
      observer?.disconnect()
    }
  }, [location.pathname, isPending])

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {announced.text}
    </div>
  )
}

export default RouteAnnouncer
