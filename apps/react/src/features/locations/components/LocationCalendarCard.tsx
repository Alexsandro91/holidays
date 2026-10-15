import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocationCalendar, type LocationDetail, type WorkSchedule } from '@/features/locations/api'
import YearSelect from '@/features/locations/components/YearSelect'
import { formatDay } from '@/features/locations/dateFormat'
import { todayIn, WEEKDAYS } from '@/features/locations/scheduleFormat'
import ProfileCard from '@/features/profile/components/ProfileCard'

interface LocationCalendarCardProps {
  location: LocationDetail
}

/**
 * Giorni non lavorativi dell'anno secondo l'orario standard (spec §3.2), in sola lettura: serve all'admin per
 * controllare a colpo d'occhio festivi, patrono e chiusure. Il riposo settimanale si riassume in una riga per versione.
 */
const LocationCalendarCard = ({ location }: LocationCalendarCardProps) => {
  const { t, i18n } = useTranslation()
  const [currentYear] = useState(() => Number(todayIn(location.timezone).slice(0, 4)))
  const [year, setYear] = useState(currentYear)
  const calendar = useLocationCalendar(location.id, year)

  const restDays = (schedule: WorkSchedule): string =>
    WEEKDAYS.filter((_, index) => (schedule.minutes[index] ?? 0) === 0)
      .map((day) => t(`schedule.weekdays.${day}`).toLowerCase())
      .join(', ')

  const restNote = (schedule: WorkSchedule, several: boolean): string => {
    const days = restDays(schedule)
    if (days === '') return t('calendar.noWeeklyRest')
    return several ? t('calendar.weeklyRestSince', { date: formatDay(schedule.valid_from, i18n.language), days }) : t('calendar.weeklyRest', { days })
  }

  return (
    <ProfileCard titleId="location-calendar-title" title={t('calendar.title')} description={t('calendar.description')}>
      <div className="grid gap-4">
        <YearSelect id="calendar-year" label={t('calendar.year')} value={year} years={[currentYear - 1, currentYear, currentYear + 1, currentYear + 2]} onChange={setYear} />
        {calendar.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : calendar.isError ? (
          <div role="alert" className="grid justify-items-start gap-2">
            <p>{t('calendar.loadError')}</p>
            <Button variant="outline" onClick={() => void calendar.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3" aria-busy={calendar.isPlaceholderData || undefined}>
            {calendar.data.schedules.map((schedule) => (
              <p key={schedule.id} className="text-sm text-muted-foreground">
                {restNote(schedule, calendar.data.schedules.length > 1)}
              </p>
            ))}
            {calendar.data.days.length === 0 ? (
              <p>{t('calendar.empty')}</p>
            ) : (
              <ol className="grid">
                {calendar.data.days.map((day) => (
                  <li key={day.date} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b py-2 last:border-b-0">
                    <time dateTime={day.date} className="font-medium first-letter:uppercase">
                      {formatDay(day.date, i18n.language, { weekday: 'long', day: 'numeric', month: 'long' })}
                    </time>
                    <span className="text-sm text-muted-foreground">{day.reasons.map((reason) => reason.label).join(' · ')}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
    </ProfileCard>
  )
}

export default LocationCalendarCard
