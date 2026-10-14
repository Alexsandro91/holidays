import { LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import SessionExpiryAnnouncement from '@/components/layout/SessionExpiryAnnouncement'
import { Button } from '@/components/ui/button'
import { isAlreadySignedOut, useLogout, useRefreshCurrentUser, type SessionLimits } from '@/features/auth/api'
import { useSessionExpiry } from '@/hooks/useSessionExpiry'
import { isApiError } from '@/lib/api'

/** Soglia dell'unico annuncio dopo quello di apertura */
const LAST_ANNOUNCEMENT_SECONDS = 30

const formatCountdown = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

interface SessionExpiryDialogProps {
  session: SessionLimits | undefined
}

/**
 * Avviso di scadenza della sessione (WCAG 2.2.1, spec fase 4 §3.3), montato nell'area riservata. Per inattività si può
 * restare collegati; per la durata assoluta si può solo prendere atto.
 */
const SessionExpiryDialog = ({ session }: SessionExpiryDialogProps) => {
  const { t } = useTranslation()
  const [renewing, setRenewing] = useState(false)
  const { open, kind, secondsLeft, dismiss } = useSessionExpiry(session, { renewing })
  const refreshCurrentUser = useRefreshCurrentUser()
  const logout = useLogout()
  // Evitano richieste doppie (doppio click, Invio ripetuto): letti solo nei gestori di evento
  const renewal = useRef(false)
  const signingOut = useRef(false)

  // Rilegge l'utente: la richiesta rinnova la sessione e la risposta aggiorna l'ultima attività, che chiude l'avviso
  const staySignedIn = async () => {
    if (renewal.current) return
    renewal.current = true
    setRenewing(true)
    try {
      await refreshCurrentUser()
    } catch (error) {
      // Un 401 lo gestiscono le route protette (login con il motivo); qui solo rete e server
      if (!isApiError(error, 'unauthenticated')) toast.error(isApiError(error, 'network') ? t('errors.network') : t('errors.generic'))
    } finally {
      renewal.current = false
      setRenewing(false)
    }
  }

  const signOut = () => {
    if (signingOut.current) return
    signingOut.current = true
    logout.mutate(undefined, {
      onError: (error) => {
        if (!isAlreadySignedOut(error)) toast.error(t('account.logoutError'))
      },
      // Uscita fallita (es. rete): si può riprovare
      onSettled: () => {
        signingOut.current = false
      },
    })
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Pulsante principale ed Escape: resta collegato, oppure "ho capito" per la durata assoluta
        if (next) return
        if (kind === 'idle') void staySignedIn()
        else dismiss()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('sessionExpiry.title')}</AlertDialogTitle>
          <AlertDialogDescription>{kind === 'idle' ? t('sessionExpiry.idleDescription') : t('sessionExpiry.absoluteDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        {/* Il conto alla rovescia cambia ogni secondo: nascosto ai lettori di schermo, che sentono solo i due annunci */}
        <div aria-hidden="true" className="grid justify-items-center gap-1 py-2">
          <span className="text-sm text-muted-foreground">{t('sessionExpiry.timeLeft')}</span>
          <span className="text-3xl font-semibold tabular-nums">{formatCountdown(secondsLeft)}</span>
        </div>
        <SessionExpiryAnnouncement
          message={secondsLeft <= LAST_ANNOUNCEMENT_SECONDS ? t('sessionExpiry.announce30') : t('sessionExpiry.announceOpen')}
        />
        <AlertDialogFooter>
          {kind === 'idle' && (
            <Button type="button" variant="outline" onClick={signOut} aria-disabled={logout.isPending || undefined}>
              {t('account.logout')}
            </Button>
          )}
          {/* Cancel: Radix gli dà il focus all'apertura, ed è l'azione sicura */}
          <AlertDialogCancel variant="default" aria-disabled={renewing || undefined}>
            {renewing && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {kind === 'idle' ? t('sessionExpiry.stay') : t('sessionExpiry.gotIt')}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default SessionExpiryDialog
