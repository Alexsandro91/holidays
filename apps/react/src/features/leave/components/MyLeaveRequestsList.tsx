import { LoaderCircle } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useMyLeaveRequests } from '@/features/leave/api'
import LeaveStatusBadge from '@/features/leave/components/LeaveStatusBadge'
import { describeDuration, describePeriod } from '@/features/leave/describeRequest'
import { LEAVE_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface MyLeaveRequestsListProps {
  /** Apre il dettaglio; `trigger` (`list-<id>`) è il valore di LEAVE_TRIGGER_ATTRIBUTE del pulsante */
  onOpen: (requestId: number, trigger: string) => void
}

/** Anni offerti: il prossimo, quello in corso e i due precedenti. */
const yearsAround = (current: number): number[] => [current + 1, current, current - 1, current - 2]

/** Le mie richieste (spec §7.2): tutte quelle dell'anno in ogni stato, dalla più recente, 20 alla volta. */
const MyLeaveRequestsList = ({ onOpen }: MyLeaveRequestsListProps) => {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const titleId = useId()
  const yearId = useId()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const requests = useMyLeaveRequests(year)
  const items = requests.data?.pages.flatMap((page) => page.data) ?? []
  const listRef = useRef<HTMLUListElement>(null)
  // Dopo "Carica altre" il focus va alla prima richiesta nuova (il pulsante può sparire)
  const focusFrom = useRef<number | null>(null)

  useEffect(() => {
    const index = focusFrom.current
    if (index === null || items.length <= index) return
    focusFrom.current = null
    listRef.current?.querySelectorAll<HTMLElement>(`[${LEAVE_TRIGGER_ATTRIBUTE}]`)[index]?.focus()
  }, [items.length])

  const years = yearsAround(currentYear)

  const body = () => {
    if (requests.isPending) {
      return (
        <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      )
    }
    if (requests.isError && items.length === 0) {
      return (
        <div role="alert" className="grid justify-items-start gap-3 rounded-lg border p-4">
          <p>{t('leave.list.loadError')}</p>
          <Button variant="outline" onClick={() => void requests.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )
    }
    if (items.length === 0) return <p className="text-muted-foreground">{t('leave.list.empty')}</p>
    return (
      <>
        <ul ref={listRef} aria-labelledby={titleId} className="grid gap-2">
          {items.map((request) => {
            const period = describePeriod(request, t, language)
            const duration = describeDuration(request.minutes, request.working_days, t, language)
            const trigger = `list-${request.id}`
            return (
              <li key={request.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <button
                  type="button"
                  {...{ [LEAVE_TRIGGER_ATTRIBUTE]: trigger }}
                  aria-label={[request.absence_type.name, period, duration, t(`leave.status.${request.status}`)].join(', ')}
                  onClick={() => onOpen(request.id, trigger)}
                  className="grid min-w-0 flex-1 gap-0.5 rounded-sm text-left outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="font-medium">{request.absence_type.name}</span>
                  <span className="text-sm text-muted-foreground">{period}</span>
                  <span className="text-sm text-muted-foreground tabular-nums">{duration}</span>
                </button>
                <LeaveStatusBadge status={request.status} />
              </li>
            )
          })}
        </ul>
        {requests.hasNextPage && (
          <Button
            variant="outline"
            className="justify-self-start"
            disabled={requests.isFetchingNextPage}
            onClick={() => {
              focusFrom.current = items.length
              void requests.fetchNextPage()
            }}
          >
            {requests.isFetchingNextPage && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {t('leave.list.loadMore')}
          </Button>
        )}
      </>
    )
  }

  return (
    <section aria-labelledby={titleId} className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={titleId} className="font-heading text-lg font-semibold">
          {t('leave.list.title')}
        </h2>
        <div className="grid gap-1">
          <Label htmlFor={yearId}>{t('leave.list.year')}</Label>
          <Select value={String(year)} onValueChange={(next) => setYear(years.find((item) => String(item) === next) ?? currentYear)}>
            <SelectTrigger id={yearId} className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {years.map((item) => (
                <SelectItem key={item} value={String(item)}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {body()}
    </section>
  )
}

export default MyLeaveRequestsList
