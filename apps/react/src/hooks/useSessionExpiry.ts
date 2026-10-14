import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { SessionLimits } from '@/features/auth/api'
import { readLastActivity, subscribeActivity } from '@/lib/sessionActivity'
import { expireSession } from '@/lib/sessionEnd'

/** L'avviso si apre 120 secondi prima della prima scadenza (spec fase 4 §3.3). */
export const SESSION_WARNING_MS = 120_000

/** Due letture dell'utente danno la stessa scadenza assoluta a meno della latenza: entro un minuto è la stessa. */
const SAME_DEADLINE_MS = 60_000

/** `idle`: inattività, si può prolungare; `absolute`: durata massima dal login, no. */
export type SessionExpiryKind = 'idle' | 'absolute'

interface Expiry {
  kind: SessionExpiryKind
  deadline: number
}

const nextExpiry = (lastActivity: number | null, session: SessionLimits | undefined): Expiry | null => {
  if (!session) return null
  const idleDeadline = lastActivity === null ? null : lastActivity + session.idleTimeoutMs
  if (idleDeadline !== null && idleDeadline < session.absoluteDeadline) return { kind: 'idle', deadline: idleDeadline }
  return { kind: 'absolute', deadline: session.absoluteDeadline }
}

export interface SessionExpiry {
  /** Avviso visibile */
  open: boolean
  kind: SessionExpiryKind
  /** Secondi alla scadenza, aggiornati una volta al secondo solo con l'avviso aperto */
  secondsLeft: number
  /** Chiude l'avviso della durata assoluta: non riappare per la stessa scadenza */
  dismiss: () => void
}

/**
 * Scadenza della sessione vista dal client: ultima attività + inattività ammessa, oppure durata assoluta. Un solo
 * `setTimeout` porta al prossimo passaggio (apertura dell'avviso o scadenza) e si ricalcola quando cambiano ultima
 * attività o scadenza; alla scadenza la sessione si chiude come per un 401 `session_expired`, senza chiamare il server.
 */
export const useSessionExpiry = (session: SessionLimits | undefined): SessionExpiry => {
  const queryClient = useQueryClient()
  const lastActivity = useSyncExternalStore(subscribeActivity, readLastActivity)
  const expiry = nextExpiry(lastActivity, session)
  const deadline = expiry?.deadline ?? null
  const kind = expiry?.kind ?? 'idle'
  // Istante di riferimento: lo aggiornano il timer dei passaggi e, con l'avviso aperto, il tick di un secondo
  const [now, setNow] = useState(() => Date.now())
  const [dismissedDeadline, setDismissedDeadline] = useState<number | null>(null)

  const stage = deadline === null ? 'none' : now >= deadline ? 'expired' : now >= deadline - SESSION_WARNING_MS ? 'warning' : 'active'
  const dismissed = kind === 'absolute' && deadline !== null && dismissedDeadline !== null && Math.abs(deadline - dismissedDeadline) < SAME_DEADLINE_MS
  const open = stage === 'warning' && !dismissed

  // Timer unico verso il prossimo passaggio: apertura dell'avviso, poi scadenza
  useEffect(() => {
    if (deadline === null) return
    const current = Date.now()
    const warningAt = deadline - SESSION_WARNING_MS
    const target = current < warningAt ? warningAt : deadline
    const id = window.setTimeout(() => setNow(Date.now()), Math.max(0, target - current))
    return () => window.clearTimeout(id)
  }, [deadline, stage])

  // Conto alla rovescia visibile: solo mentre l'avviso è aperto
  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [open])

  useEffect(() => {
    if (stage === 'expired') expireSession(queryClient)
  }, [stage, queryClient])

  const dismiss = useCallback(() => setDismissedDeadline(deadline), [deadline])

  return { open, kind, secondsLeft: deadline === null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000)), dismiss }
}
