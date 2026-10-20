import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDayRange } from '@/features/locations/dateFormat'
import LeaveStatusBadge from '@/features/leave/components/LeaveStatusBadge'
import { useProfileCalendar, type LeaveRequest } from '@/features/leave/api'

const MAX_ITEMS = 5

/** Data locale come YYYY-MM-DD, a `offset` giorni da oggi. */
const localDay = (offset: number): string => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const ACTIVE_STATUSES: readonly LeaveRequest['status'][] = ['pending', 'approved', 'cancellation_requested']

/** Prossime assenze (spec §7.1): le richieste attive non ancora finite, al massimo 5, la più vicina per prima. */
const UpcomingLeave = () => {
  const { t, i18n } = useTranslation()
  const today = localDay(0)
  // Un anno di calendario (limite di 366 giorni): una sola lettura non paginata, già ordinata per data
  const calendar = useProfileCalendar(today, localDay(365))

  const body = () => {
    if (calendar.data === undefined && calendar.isPending) return <Skeleton className="h-10 w-full" />
    if (calendar.data === undefined) {
      return (
        <div role="alert" className="grid justify-items-start gap-2">
          <p>{t('home.upcoming.loadError')}</p>
          <Button variant="outline" onClick={() => void calendar.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )
    }
    const items = calendar.data.requests
      .filter((request) => ACTIVE_STATUSES.includes(request.status) && request.ends_on >= today)
      .sort((a, b) => a.starts_on.localeCompare(b.starts_on) || a.id - b.id)
      .slice(0, MAX_ITEMS)
    if (items.length === 0) return <p className="text-muted-foreground">{t('home.upcoming.empty')}</p>
    return (
      <ul aria-label={t('home.upcoming.title')} className="grid gap-2">
        {items.map((request) => (
          <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <span className="grid gap-0.5">
              <span className="font-medium">{request.absence_type.name}</span>
              <span className="text-muted-foreground">{formatDayRange(request.starts_on, request.ends_on, i18n.language)}</span>
            </span>
            <LeaveStatusBadge status={request.status} />
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section aria-labelledby="home-upcoming-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="home-upcoming-title" className="font-heading text-base font-semibold">
          {t('home.upcoming.title')}
        </h2>
        <Link to="/leave" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          {t('home.upcoming.calendar')}
        </Link>
      </div>
      {body()}
    </section>
  )
}

export default UpcomingLeave
