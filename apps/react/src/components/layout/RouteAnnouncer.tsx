import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { APP_NAME } from '@/lib/appName'
import { useRouteTitleKey } from '@/lib/routeTitle'

/** A ogni cambio di pagina: titolo del documento, focus sull'h1 e annuncio per i lettori di schermo. */
const RouteAnnouncer = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const titleKey = useRouteTitleKey()
  const title = titleKey ? t(titleKey) : null

  useEffect(() => {
    if (!title) return
    document.title = `${title} · ${APP_NAME}`
    const frame = window.requestAnimationFrame(() => document.getElementById('page-title')?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(frame)
  }, [title, location.pathname])

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true">
      {title ? t('a11y.pageAnnouncement', { title }) : ''}
    </div>
  )
}

export default RouteAnnouncer
