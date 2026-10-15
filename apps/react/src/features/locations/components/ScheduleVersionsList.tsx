import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { WorkSchedule } from '@/features/locations/api'
import ScheduleSummary from '@/features/locations/components/ScheduleSummary'
import { formatDay } from '@/features/locations/dateFormat'
import { LOCATION_DETAIL_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface ScheduleVersionsListProps {
  /** Versioni dalla più recente, come le manda il server */
  schedules: WorkSchedule[]
  onDelete: (schedule: WorkSchedule) => void
}

/**
 * Versioni di un orario: in arrivo (cancellabili), in vigore e precedenti (spec §2.3). Le versioni già iniziate non si
 * cancellano: il server lo rifiuta, qui il pulsante non c'è.
 */
const ScheduleVersionsList = ({ schedules, onDelete }: ScheduleVersionsListProps) => {
  const { t, i18n } = useTranslation()
  const upcoming = schedules.filter((schedule) => !schedule.is_started)
  const started = schedules.filter((schedule) => schedule.is_started)
  const [current, ...past] = started

  const item = (schedule: WorkSchedule, deletable: boolean) => {
    const date = formatDay(schedule.valid_from, i18n.language)
    return (
      <li key={schedule.id} className="grid gap-2 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t('schedule.since', { date })}</p>
          {deletable && (
            <Button
              variant="outline"
              size="sm"
              aria-label={t('schedule.versions.deleteFor', { date })}
              {...{ [LOCATION_DETAIL_TRIGGER_ATTRIBUTE]: `schedule-${schedule.id}` }}
              onClick={() => onDelete(schedule)}
            >
              {t('schedule.versions.delete')}
            </Button>
          )}
        </div>
        {schedule.follows_location ? <p className="text-sm text-muted-foreground">{t('schedule.versions.followsLocation')}</p> : <ScheduleSummary minutes={schedule.minutes} />}
      </li>
    )
  }

  const group = (title: string, list: WorkSchedule[], deletable: boolean) =>
    list.length > 0 && (
      <div className="grid gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <ul className="grid gap-2">{list.map((schedule) => item(schedule, deletable))}</ul>
      </div>
    )

  return (
    <div className="grid gap-4">
      {group(t('schedule.versions.upcoming'), upcoming, true)}
      {current !== undefined && group(t('schedule.versions.current'), [current], false)}
      {group(t('schedule.versions.past'), past, false)}
    </div>
  )
}

export default ScheduleVersionsList
