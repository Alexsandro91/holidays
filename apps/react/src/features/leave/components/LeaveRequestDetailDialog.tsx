import { LoaderCircle } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser } from '@/features/auth/api'
import { formatHours } from '@/features/balances/hoursFormat'
import { useLeaveAction, useLeaveRequest, type LeaveRequest } from '@/features/leave/api'
import LeaveStatusBadge from '@/features/leave/components/LeaveStatusBadge'
import RejectNoteField from '@/features/leave/components/RejectNoteField'
import { describeDuration, describePeriod } from '@/features/leave/describeRequest'
import { formatDay } from '@/features/locations/dateFormat'
import { isApiError } from '@/lib/api'
import { focusTrigger, LEAVE_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'
import { cn } from '@/lib/utils'

/** Azioni del dettaglio, nell'ordine dei pulsanti, con il permesso di `can` che le abilita. */
type DetailAction = 'withdraw' | 'cancellation' | 'approve' | 'reject' | 'approve_cancellation' | 'reject_cancellation' | 'cancel'
const ACTIONS: readonly { action: DetailAction; permission: keyof LeaveRequest['can'] }[] = [
  { action: 'withdraw', permission: 'withdraw' },
  { action: 'cancellation', permission: 'request_cancellation' },
  { action: 'approve', permission: 'approve' },
  { action: 'reject', permission: 'reject' },
  { action: 'approve_cancellation', permission: 'approve_cancellation' },
  { action: 'reject_cancellation', permission: 'reject_cancellation' },
  { action: 'cancel', permission: 'cancel' },
]

/** Azioni che confermano senza distruggere nulla: pulsante pieno invece che rosso. */
const isPositive = (action: DetailAction): boolean => action === 'approve' || action === 'approve_cancellation' || action === 'cancellation'

const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }

/** Data e ora di un evento (decisione, annullamento): istanti, quindi nel fuso del dispositivo. */
const formatMoment = (value: string, language: string): string => new Intl.DateTimeFormat(language, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(value))

interface DetailRowProps {
  label: string
  children: ReactNode
}

const DetailRow = ({ label, children }: DetailRowProps) => (
  <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words">{children}</dd>
  </div>
)

interface DetailBodyProps {
  requestId: number
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

const DetailBody = ({ requestId, onClose, onBusyChange }: DetailBodyProps) => {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const detail = useLeaveRequest(requestId)
  const { data: viewer } = useCurrentUser()
  const daysId = useId()
  const confirmId = useId()
  const leaveAction = useLeaveAction()
  const [confirming, setConfirming] = useState<DetailAction | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  // Motivo del rifiuto, scritto nella conferma
  const [rejectNote, setRejectNote] = useState('')
  const footerRef = useRef<HTMLDivElement>(null)
  const conflictRef = useRef<HTMLParagraphElement>(null)
  // Dopo "Indietro" il focus torna al pulsante dell'azione
  const returnTo = useRef<DetailAction | null>(null)
  // Evita il doppio invio: letto solo nei gestori di evento
  const submitting = useRef(false)

  useEffect(() => {
    const footer = footerRef.current
    if (footer === null) return
    if (confirming !== null) {
      footer.querySelector<HTMLElement>('[data-confirm-back]')?.focus()
      return
    }
    if (returnTo.current === null) return
    footer.querySelector<HTMLElement>(`[data-action="${returnTo.current}"]`)?.focus()
    returnTo.current = null
  }, [confirming])

  useEffect(() => {
    if (conflict !== null) conflictRef.current?.focus()
  }, [conflict])

  const request = detail.data

  if (request === undefined) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{t('leave.detail.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('common.loading')}</DialogDescription>
        </DialogHeader>
        {detail.isError ? (
          <div role="alert" className="grid justify-items-start gap-3">
            <p>{t('leave.detail.loadError')}</p>
            <Button variant="outline" onClick={() => void detail.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        )}
      </>
    )
  }

  const confirm = async (action: DetailAction) => {
    if (submitting.current) return
    submitting.current = true
    onBusyChange(true)
    setConflict(null)
    try {
      await leaveAction.mutateAsync({ id: request.id, action, note: action === 'reject' ? rejectNote : undefined })
      toast.success(t(`leave.detail.done.${action}`))
      onClose()
    } catch (error) {
      submitting.current = false
      setConfirming(null)
      // Stato cambiato nel frattempo o assenza già iniziata: il messaggio resta nel dialog e la richiesta si rilegge
      if (isApiError(error) && error.status === 409) {
        setConflict(error.message)
        void detail.refetch()
        return
      }
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    } finally {
      onBusyChange(false)
    }
  }

  // Chi chiede un annullamento per sé lo approva poi da approvatore: l'annullamento diretto (con l'email alla persona) è solo per le richieste altrui
  // Finché il visitatore non è letto non si sa se è il proprietario: l'azione non compare
  const canCancelDirectly = viewer !== undefined && viewer !== null && viewer.id !== request.user.id
  const available = ACTIONS.filter(({ action, permission }) => request.can[permission] && !(action === 'cancel' && !canCancelDirectly))
  const decisionLabel = request.status === 'rejected' ? t('leave.detail.rejectionReason') : t('leave.detail.decisionNote')
  const autoApproved = request.decided_by_name === null && request.decided_at !== null

  return (
    <>
      <DialogHeader>
        <DialogTitle>{request.absence_type.name}</DialogTitle>
        <DialogDescription>{describePeriod(request, t, language)}</DialogDescription>
      </DialogHeader>
      <dl className="grid gap-3">
        <DetailRow label={t('leave.detail.status')}>
          <LeaveStatusBadge status={request.status} />
        </DetailRow>
        <DetailRow label={t('leave.detail.duration')}>{describeDuration(request.minutes, request.working_days, t, language)}</DetailRow>
        {request.decided_at !== null && (
          <DetailRow label={t('leave.detail.decidedBy')}>
            {autoApproved ? t('leave.detail.autoApproved') : t('leave.detail.decidedValue', { name: request.decided_by_name, date: formatMoment(request.decided_at, language) })}
          </DetailRow>
        )}
        {request.cancellation_requested_at !== null && (
          <DetailRow label={t('leave.detail.cancellationRequestedAt')}>{formatMoment(request.cancellation_requested_at, language)}</DetailRow>
        )}
        {request.cancelled_at !== null && (
          <DetailRow label={t('leave.detail.cancelledBy')}>
            {request.cancelled_by_name === null ? formatMoment(request.cancelled_at, language) : t('leave.detail.decidedValue', { name: request.cancelled_by_name, date: formatMoment(request.cancelled_at, language) })}
          </DetailRow>
        )}
        {request.note !== null && <DetailRow label={t('leave.detail.note')}>{request.note}</DetailRow>}
        {request.decision_note !== null && <DetailRow label={decisionLabel}>{request.decision_note}</DetailRow>}
      </dl>
      {request.days !== undefined && request.days.length > 0 && (
        <section aria-labelledby={daysId} className="grid gap-2">
          <h3 id={daysId} className="font-medium">
            {t('leave.detail.days')}
          </h3>
          <ul aria-labelledby={daysId} tabIndex={request.days.length > 7 ? 0 : undefined} className="grid max-h-56 gap-1 overflow-y-auto rounded-md border border-border p-2">
            {request.days.map((day) => (
              <li key={day.date} className={cn('flex justify-between gap-3', day.minutes === 0 && 'text-muted-foreground')}>
                <span>{formatDay(day.date, language, LONG_DATE)}</span>
                <span className="tabular-nums">{day.minutes > 0 ? t('leave.detail.dayHours', { hours: formatHours(day.minutes, language) }) : t('leave.detail.dayOff')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {conflict !== null && (
        <p ref={conflictRef} role="alert" tabIndex={-1} className="rounded-md border border-destructive/40 p-3 text-destructive outline-none">
          {conflict}
        </p>
      )}
      {available.length > 0 && (
        <div ref={footerRef}>
          {confirming === null ? (
            <DialogFooter>
              {available.map(({ action }) => (
                <Button key={action} variant={action === 'cancellation' ? 'outline' : isPositive(action) ? 'default' : 'destructive'} data-action={action} onClick={() => setConfirming(action)}>
                  {t(`leave.detail.actions.${action}`)}
                </Button>
              ))}
            </DialogFooter>
          ) : (
            <div role="group" aria-labelledby={confirmId} className="grid gap-3 rounded-md border border-border p-3">
              <p id={confirmId}>{t(`leave.detail.confirm.${confirming}`)}</p>
              {confirming === 'reject' && <RejectNoteField value={rejectNote} onChange={setRejectNote} disabled={leaveAction.isPending} />}
              <DialogFooter>
                <Button
                  variant="outline"
                  data-confirm-back
                  disabled={leaveAction.isPending}
                  onClick={() => {
                    returnTo.current = confirming
                    setConfirming(null)
                  }}
                >
                  {t('leave.detail.back')}
                </Button>
                <Button variant={confirming === 'cancellation' || isPositive(confirming) ? 'default' : 'destructive'} disabled={leaveAction.isPending} onClick={() => void confirm(confirming)}>
                  {leaveAction.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                  {t(`leave.detail.actions.${confirming}`)}
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      )}
    </>
  )
}

interface LeaveRequestDetailDialogProps {
  open: boolean
  /** Richiesta da mostrare; resta impostata durante l'animazione di chiusura */
  requestId: number | null
  /** Valore di LEAVE_TRIGGER_ATTRIBUTE dell'elemento che riprende il focus alla chiusura (null = titolo della pagina) */
  returnFocusTo: string | null
  onClose: () => void
}

/** Dettaglio di una richiesta (spec §7.2): stato, decisione, note, giorni, e le azioni permesse da `can`. */
const LeaveRequestDetailDialog = ({ open, requestId, returnFocusTo, onClose }: LeaveRequestDetailDialogProps) => {
  // Conta le aperture: ogni apertura rimonta il contenuto (niente conferme o errori rimasti dalla volta prima)
  const [openCount, setOpenCount] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount(openCount + 1)
  }
  // Durante l'invio il dialog non si chiude (Escape, clic fuori)
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={open && requestId !== null} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(LEAVE_TRIGGER_ATTRIBUTE, returnFocusTo)
        }}
      >
        {requestId !== null && <DetailBody key={`${openCount}-${requestId}`} requestId={requestId} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  )
}

export default LeaveRequestDetailDialog
