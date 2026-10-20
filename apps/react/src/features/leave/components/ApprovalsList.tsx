import { TriangleAlert } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrentUser, useMultipleLocations } from '@/features/auth/api'
import { useApprovals, useLeaveAction, type LeaveRequest } from '@/features/leave/api'
import RejectDialog from '@/features/leave/components/RejectDialog'
import { describeDuration, describePeriod, describeWarning } from '@/features/leave/describeRequest'
import { LEAVE_STATUS_CLASSES } from '@/features/leave/statusStyles'
import { useLocationOptions } from '@/features/locations/api'
import { isApiError } from '@/lib/api'
import { LEAVE_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'
import { cn } from '@/lib/utils'

type ApprovalAction = 'approve' | 'reject' | 'approve_cancellation' | 'reject_cancellation'

/** Azioni di una riga, nell'ordine dei pulsanti, con il permesso di `can` che le abilita. */
const ACTIONS: readonly { action: ApprovalAction; permission: keyof LeaveRequest['can'] }[] = [
  { action: 'approve', permission: 'approve' },
  { action: 'reject', permission: 'reject' },
  { action: 'approve_cancellation', permission: 'approve_cancellation' },
  { action: 'reject_cancellation', permission: 'reject_cancellation' },
]

const ALL_LOCATIONS = 'all'

interface ApprovalsListProps {
  /** Apre il dettaglio; `trigger` (`approval-<id>`) è il valore di LEAVE_TRIGGER_ATTRIBUTE del pulsante */
  onOpen: (requestId: number, trigger: string) => void
}

/** Da approvare (spec §6, §7.2): richieste e annullamenti in attesa, dalla più vecchia, con le azioni sulla riga. */
const ApprovalsList = ({ onOpen }: ApprovalsListProps) => {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const { data: user } = useCurrentUser()
  const multipleLocations = useMultipleLocations()
  // Il filtro per sede è dell'admin con più sedi: ai responsabili il server lo vieta (422)
  const canFilter = user?.role === 'admin' && multipleLocations
  const locations = useLocationOptions(canFilter)
  const [location, setLocation] = useState<number | null>(null)
  const approvals = useApprovals(canFilter ? location : null)
  const leaveAction = useLeaveAction()
  const titleId = useId()
  const locationId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [conflict, setConflict] = useState(false)
  const [rejecting, setRejecting] = useState<{ open: boolean; request: LeaveRequest | null }>({ open: false, request: null })
  // Evita il doppio invio: letto solo nei gestori di evento
  const submitting = useRef(false)

  const items = approvals.data?.data ?? []
  const total = approvals.data?.meta.count ?? 0

  const decide = async (request: LeaveRequest, action: ApprovalAction, note?: string) => {
    if (submitting.current) return
    submitting.current = true
    setConflict(false)
    try {
      await leaveAction.mutateAsync({ id: request.id, action, note })
      toast.success(t(`leave.approvals.done.${action}`, { name: request.user.name }))
      setRejecting({ open: false, request: null })
      // La riga decisa sparisce: il focus passa al titolo dell'elenco
      headingRef.current?.focus()
    } catch (error) {
      setRejecting((current) => ({ ...current, open: false }))
      // Stato cambiato nel frattempo: l'elenco si rilegge da solo (invalidazione) e il messaggio lo spiega
      if (isApiError(error) && error.status === 409) setConflict(true)
      else toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    } finally {
      submitting.current = false
    }
  }

  const body = () => {
    if (approvals.isPending) {
      return (
        <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-24 w-full" />
          ))}
        </div>
      )
    }
    if (approvals.isError && approvals.data === undefined) {
      return (
        <div role="alert" className="grid justify-items-start gap-3 rounded-lg border p-4">
          <p>{t('leave.approvals.loadError')}</p>
          <Button variant="outline" onClick={() => void approvals.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )
    }
    if (items.length === 0) return <p className="text-muted-foreground">{t('leave.approvals.empty')}</p>
    return (
      <>
        <ul aria-labelledby={titleId} className="grid gap-3">
          {items.map((request) => {
            const period = describePeriod(request, t, language)
            const name = request.user.name
            const trigger = `approval-${request.id}`
            const available = ACTIONS.filter(({ permission }) => request.can[permission])
            return (
              <li key={request.id} className="grid gap-3 rounded-lg border border-border p-4 lg:grid-cols-[1fr_auto] lg:items-start">
                <div className="grid min-w-0 gap-1.5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button
                      type="button"
                      {...{ [LEAVE_TRIGGER_ATTRIBUTE]: trigger }}
                      aria-label={t('leave.approvals.open', { name })}
                      onClick={() => onOpen(request.id, trigger)}
                      className="rounded-sm text-left font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {name}
                    </button>
                    <span>{request.absence_type.name}</span>
                    {request.status === 'cancellation_requested' && (
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', LEAVE_STATUS_CLASSES.cancellation_requested)}>{t('leave.approvals.cancellationRequested')}</span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{period}</p>
                  <p className="text-sm text-muted-foreground tabular-nums">{describeDuration(request.minutes, request.working_days, t, language)}</p>
                  {request.note !== null && <p className="min-w-0 break-words text-sm">{request.note}</p>}
                  {request.warnings !== undefined && request.warnings.length > 0 && (
                    <ul aria-label={t('leave.warnings.title')} className="grid gap-1 text-sm">
                      {request.warnings.map((warning) => (
                        <li key={warning.code} className={cn('flex items-start gap-1.5', warning.code === 'balance_insufficient' ? 'text-destructive' : 'text-muted-foreground')}>
                          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                          <span className={cn(warning.code === 'balance_insufficient' && 'font-medium')}>{describeWarning(warning, t, language)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {available.map(({ action }) => (
                    <Button
                      key={action}
                      variant={action === 'approve' || action === 'approve_cancellation' ? 'default' : 'outline'}
                      disabled={leaveAction.isPending}
                      {...(action === 'reject' ? { [LEAVE_TRIGGER_ATTRIBUTE]: `approval-reject-${request.id}` } : {})}
                      aria-label={`${t(`leave.approvals.actions.${action}`)}, ${name}, ${period}`}
                      onClick={() => (action === 'reject' ? setRejecting({ open: true, request }) : void decide(request, action))}
                    >
                      {t(`leave.approvals.actions.${action}`)}
                    </Button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
        {total > items.length && <p className="text-sm text-muted-foreground">{t('leave.approvals.truncated', { shown: items.length, count: total })}</p>}
      </>
    )
  }

  return (
    <section aria-labelledby={titleId} className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={titleId} ref={headingRef} tabIndex={-1} className="font-heading text-lg font-semibold outline-none">
          {t('leave.approvals.title')}
        </h2>
        {canFilter && (
          <div className="grid gap-1">
            <Label htmlFor={locationId}>{t('leave.approvals.location')}</Label>
            <Select value={location === null ? ALL_LOCATIONS : String(location)} onValueChange={(next) => setLocation(next === ALL_LOCATIONS ? null : Number(next))}>
              <SelectTrigger id={locationId} className="w-56 max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value={ALL_LOCATIONS}>{t('leave.approvals.allLocations')}</SelectItem>
                {(locations.data ?? []).map((option) => (
                  <SelectItem key={option.id} value={String(option.id)}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      {conflict && (
        <p role="alert" className="rounded-md border border-destructive/40 p-3 text-destructive">
          {t('leave.approvals.conflict')}
        </p>
      )}
      {body()}
      <RejectDialog
        open={rejecting.open}
        request={rejecting.request}
        pending={leaveAction.isPending}
        returnFocusTo={rejecting.request === null ? null : `approval-reject-${rejecting.request.id}`}
        onConfirm={(note) => rejecting.request !== null && void decide(rejecting.request, 'reject', note)}
        onClose={() => setRejecting((current) => ({ ...current, open: false }))}
      />
    </section>
  )
}

export default ApprovalsList
