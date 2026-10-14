import { useEffect, useState } from 'react'

/** Ritardo dopo l'apertura: il lettore di schermo deve vedere la regione vuota prima del testo */
const FILL_DELAY_MS = 100

interface SessionExpiryAnnouncementProps {
  message: string
}

/**
 * Regione live `polite` dell'avviso di scadenza. Molti lettori di schermo non annunciano il testo iniziale di una regione
 * appena inserita: si monta vuota (insieme al dialog) e si riempie subito dopo. Deve stare dentro il dialog, perché
 * fuori Radix la nasconde con `aria-hidden`.
 */
const SessionExpiryAnnouncement = ({ message }: SessionExpiryAnnouncementProps) => {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), FILL_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {ready ? message : ''}
    </p>
  )
}

export default SessionExpiryAnnouncement
