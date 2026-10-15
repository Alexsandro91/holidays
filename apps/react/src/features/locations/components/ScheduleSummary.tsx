import { useTranslation } from 'react-i18next'
import { formatMinutes, WEEKDAYS } from '@/features/locations/scheduleFormat'

interface ScheduleSummaryProps {
  minutes: number[]
}

/** Orario in sola lettura: sette caselle con il giorno abbreviato (nome intero per gli screen reader) e le ore. */
const ScheduleSummary = ({ minutes }: ScheduleSummaryProps) => {
  const { t } = useTranslation()
  return (
    <dl className="grid grid-cols-7 gap-1 text-center">
      {WEEKDAYS.map((day, index) => {
        const value = minutes[index] ?? 0
        return (
          <div key={day} className="grid gap-1 rounded-md bg-muted px-1 py-2">
            <dt className="text-xs text-muted-foreground">
              <span aria-hidden="true">{t(`schedule.weekdaysShort.${day}`)}</span>
              <span className="sr-only">{t(`schedule.weekdays.${day}`)}</span>
            </dt>
            <dd className="text-sm font-medium tabular-nums">
              {value === 0 ? (
                <>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">{t('schedule.nonWorking')}</span>
                </>
              ) : (
                t('schedule.hours', { hours: formatMinutes(value) })
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

export default ScheduleSummary
