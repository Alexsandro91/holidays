import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useProfileCalendar, type LeaveRequest, type LeaveRequestStatus, type ProfileCalendar } from '@/features/leave/api'
import { addDays, addMonths, monthOf, monthRange, monthWeeks, shiftMonth, todayLocal, weekEdge, type LeaveDayRange } from '@/features/leave/calendarDates'
import LeaveStatusBadge from '@/features/leave/components/LeaveStatusBadge'
import { CANCELLATION_STRIPES, LEAVE_STATUS_CLASSES } from '@/features/leave/statusStyles'
import { formatDay } from '@/features/locations/dateFormat'
import { LEAVE_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'
import { cn } from '@/lib/utils'

interface LeaveMonthCalendarProps {
  /** Primo e ultimo giorno scelti; `trigger` è il valore di LEAVE_TRIGGER_ATTRIBUTE dell'ultimo giorno scelto */
  onSelectRange: (range: LeaveDayRange, trigger: string) => void
  /** Clic su una richiesta del calendario; `trigger` come sopra */
  onOpenRequest: (requestId: number, trigger: string) => void
}

type CalendarDay = ProfileCalendar['days'][number]

// Ritirate e annullate non compaiono sul calendario (spec §7.2)
const SHOWN_STATUSES: readonly LeaveRequestStatus[] = ['pending', 'approved', 'rejected', 'cancellation_requested']
// 5 ottobre 2026 è un lunedì: da lì i nomi dei giorni nella lingua corrente
const FIRST_MONDAY = '2026-10-05'
const LONG_DATE: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }

/** Tasti di spostamento della griglia (pattern ARIA "date grid"): il giorno di arrivo da quello attivo. */
const MOVES: Record<string, (date: string) => string> = {
  ArrowLeft: (date) => addDays(date, -1),
  ArrowRight: (date) => addDays(date, 1),
  ArrowUp: (date) => addDays(date, -7),
  ArrowDown: (date) => addDays(date, 7),
  Home: (date) => weekEdge(date, 'start'),
  End: (date) => weekEdge(date, 'end'),
  PageUp: (date) => shiftMonth(date, -1),
  PageDown: (date) => shiftMonth(date, 1),
}

/**
 * Il mio calendario (spec §7.2): mese con il lunedì primo, giorni non lavorativi in grigio con il motivo, richieste
 * colorate per stato. Si scelgono il primo e l'ultimo giorno con il clic o con la tastiera (frecce, Invio, Esc).
 */
const LeaveMonthCalendar = ({ onSelectRange, onOpenRequest }: LeaveMonthCalendarProps) => {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const today = todayLocal()
  const titleId = useId()
  const hintId = useId()
  const [month, setMonth] = useState(() => monthOf(todayLocal()))
  const [focused, setFocused] = useState(today)
  // Primo giorno scelto, in attesa dell'ultimo
  const [anchor, setAnchor] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const gridRef = useRef<HTMLTableElement>(null)
  // Il focus si sposta sulla cella attiva solo dopo un tasto, non dopo un clic sulle frecce del mese
  const focusActive = useRef(false)

  const { from, to } = monthRange(month)
  const calendar = useProfileCalendar(from, to)
  const active = monthOf(focused) === month ? focused : monthOf(today) === month ? today : from

  useEffect(() => {
    if (!focusActive.current) return
    focusActive.current = false
    gridRef.current?.querySelector<HTMLElement>(`[data-date="${active}"]`)?.focus()
  }, [active])

  const days = useMemo(() => new Map<string, CalendarDay>((calendar.data?.days ?? []).map((day) => [day.date, day])), [calendar.data])
  const requestsByDate = useMemo(() => {
    const map = new Map<string, LeaveRequest[]>()
    for (const request of calendar.data?.requests ?? []) {
      if (!SHOWN_STATUSES.includes(request.status)) continue
      const last = request.ends_on < to ? request.ends_on : to
      for (let date = request.starts_on > from ? request.starts_on : from; date <= last; date = addDays(date, 1)) map.set(date, [...(map.get(date) ?? []), request])
    }
    return map
  }, [calendar.data, from, to])

  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(FIRST_MONDAY, index)
    return { short: formatDay(date, language, { weekday: 'short' }), long: formatDay(date, language, { weekday: 'long' }) }
  })
  const longDate = (date: string) => formatDay(date, language, LONG_DATE)

  const rangeEnd = anchor === null ? null : (hovered ?? active)
  const inRange = (date: string) => anchor !== null && rangeEnd !== null && date >= (anchor < rangeEnd ? anchor : rangeEnd) && date <= (anchor < rangeEnd ? rangeEnd : anchor)

  const changeMonth = (delta: number) => {
    setMonth(addMonths(month, delta))
    setFocused(shiftMonth(active, delta))
  }

  const goTo = (date: string) => {
    focusActive.current = true
    setFocused(date)
    if (monthOf(date) !== month) setMonth(monthOf(date))
  }

  const pick = (date: string) => {
    if (date < today) {
      setMessage(t('leave.calendar.pastDay'))
      return
    }
    if (anchor === null) {
      setAnchor(date)
      setMessage(t('leave.calendar.anchor', { date: longDate(date) }))
      return
    }
    setAnchor(null)
    setHovered(null)
    setMessage('')
    onSelectRange(anchor <= date ? { startsOn: anchor, endsOn: date } : { startsOn: date, endsOn: anchor }, `day-${date}`)
  }

  const cancelSelection = () => {
    setAnchor(null)
    setHovered(null)
    setMessage(t('leave.calendar.selectionCancelled'))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      pick(active)
      return
    }
    if (event.key === 'Escape') {
      if (anchor === null) return
      event.preventDefault()
      cancelSelection()
      return
    }
    const move = MOVES[event.key]
    if (move === undefined) return
    event.preventDefault()
    goTo(move(active))
  }

  const cellLabel = (date: string, day: CalendarDay | undefined, requests: LeaveRequest[]): string =>
    [
      longDate(date),
      ...(date === today ? [t('leave.calendar.today')] : []),
      ...(day?.reasons ?? []).map((reason) => reason.label),
      ...requests.map((request) => t('leave.calendar.requestInDay', { type: request.absence_type.name, status: t(`leave.status.${request.status}`) })),
    ].join(', ')

  const renderDay = (date: string) => {
    const day = days.get(date)
    const requests = requestsByDate.get(date) ?? []
    const nonWorking = day !== undefined && day.minutes === 0
    const past = date < today
    const selected = inRange(date)
    const isActive = date === active
    // Il motivo si scrive nella cella per festivi, patrono e chiusure; il riposo settimanale resta solo grigio
    const shownReason = day?.reasons.find((reason) => reason.type !== 'weekly_rest')?.label

    return (
      <td
        key={date}
        role="gridcell"
        data-date={date}
        data-non-working={nonWorking ? 'true' : undefined}
        {...{ [LEAVE_TRIGGER_ATTRIBUTE]: `day-${date}` }}
        tabIndex={isActive ? 0 : -1}
        aria-label={cellLabel(date, day, requests)}
        aria-selected={selected}
        aria-disabled={past ? true : undefined}
        onClick={() => pick(date)}
        onFocus={() => setFocused(date)}
        onMouseEnter={() => anchor !== null && setHovered(date)}
        className={cn(
          'h-16 cursor-pointer border border-border p-1 align-top outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:h-24',
          nonWorking && 'bg-muted text-muted-foreground',
          past && 'cursor-not-allowed text-muted-foreground',
          selected && 'bg-primary-soft text-primary-soft-foreground',
        )}
      >
        <div aria-hidden="true" className="flex items-start justify-between gap-1">
          <span className={cn('inline-flex size-6 items-center justify-center rounded-full text-sm tabular-nums', date === today && 'bg-primary font-semibold text-primary-foreground')}>
            {Number(date.slice(8, 10))}
          </span>
        </div>
        {shownReason !== undefined && <p className="mt-0.5 hidden truncate text-[11px] leading-4 sm:block">{shownReason}</p>}
        {requests.length > 0 && (
          <div className="mt-1 grid gap-0.5">
            {requests.map((request) => {
              const trigger = `chip-${request.id}-${date}`
              return (
                <button
                  key={request.id}
                  type="button"
                  tabIndex={isActive ? 0 : -1}
                  data-status={request.status}
                  {...{ [LEAVE_TRIGGER_ATTRIBUTE]: trigger }}
                  aria-label={t('leave.calendar.openRequest', { type: request.absence_type.name, status: t(`leave.status.${request.status}`) })}
                  onClick={(event) => {
                    // Aprire una richiesta non sceglie il giorno
                    event.stopPropagation()
                    onOpenRequest(request.id, trigger)
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  className={cn(
                    'block h-4 w-full min-w-0 truncate rounded-sm px-1 text-left text-[11px] leading-4 font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring sm:h-5 sm:leading-5',
                    LEAVE_STATUS_CLASSES[request.status],
                    request.status === 'cancellation_requested' && CANCELLATION_STRIPES,
                  )}
                >
                  <span aria-hidden="true" className="hidden sm:inline">
                    {request.absence_type.name}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </td>
    )
  }

  return (
    <section aria-labelledby={titleId} className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="font-heading text-lg font-semibold first-letter:uppercase">
          {formatDay(from, language, { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex gap-1">
          <Button variant="outline" size="icon-sm" aria-label={t('leave.calendar.previous')} onClick={() => changeMonth(-1)}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label={t('leave.calendar.next')} onClick={() => changeMonth(1)}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p id={hintId} className="text-sm text-muted-foreground">
        {t('leave.calendar.hint')}
      </p>
      {calendar.isError && calendar.data === undefined && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
          <p>{t('leave.calendar.loadError')}</p>
          <Button variant="outline" size="sm" onClick={() => void calendar.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )}
      <table
        ref={gridRef}
        role="grid"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        aria-busy={calendar.isFetching ? true : undefined}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHovered(null)}
        className="w-full table-fixed border-collapse"
      >
        <thead>
          <tr>
            {weekdays.map((weekday) => (
              <th key={weekday.long} scope="col" className="pb-1 text-xs font-semibold text-muted-foreground uppercase">
                <span aria-hidden="true">{weekday.short}</span>
                <span className="sr-only">{weekday.long}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(month).map((week) => (
            <tr key={week.find((date) => date !== null) ?? ''}>{week.map((date, index) => (date === null ? <td key={`blank-${index}`} role="gridcell" className="border border-transparent" /> : renderDay(date)))}</tr>
          ))}
        </tbody>
      </table>
      <div className="flex min-h-9 flex-wrap items-center gap-3">
        <p aria-live="polite" className="text-sm">
          {message}
        </p>
        {anchor !== null && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              cancelSelection()
              gridRef.current?.querySelector<HTMLElement>(`[data-date="${active}"]`)?.focus()
            }}
          >
            {t('leave.calendar.cancelSelection')}
          </Button>
        )}
      </div>
      <ul aria-label={t('leave.calendar.legend')} className="flex flex-wrap items-center gap-2 text-sm">
        {SHOWN_STATUSES.map((status) => (
          <li key={status}>
            <LeaveStatusBadge status={status} className={cn(status === 'cancellation_requested' && CANCELLATION_STRIPES)} />
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden="true" className="size-3.5 rounded-sm border border-border bg-muted" />
          {t('leave.calendar.nonWorking')}
        </li>
      </ul>
    </section>
  )
}

export default LeaveMonthCalendar
