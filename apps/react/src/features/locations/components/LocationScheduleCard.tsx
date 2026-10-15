import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDeleteLocationSchedule, useLocationSchedules, type LocationDetail, type WorkSchedule } from '@/features/locations/api'
import ConfirmDeleteDialog from '@/features/locations/components/ConfirmDeleteDialog'
import ScheduleDialog from '@/features/locations/components/ScheduleDialog'
import ScheduleSummary from '@/features/locations/components/ScheduleSummary'
import ScheduleVersionsList from '@/features/locations/components/ScheduleVersionsList'
import { formatDay } from '@/features/locations/dateFormat'
import { DEFAULT_WEEK } from '@/features/locations/scheduleFormat'
import ProfileCard from '@/features/profile/components/ProfileCard'
import { isApiError } from '@/lib/api'
import { LOCATION_DETAIL_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface LocationScheduleCardProps {
  location: LocationDetail
}

/** Orario standard in vigore, Cambia orario e versioni (in arrivo, in vigore, precedenti). */
const LocationScheduleCard = ({ location }: LocationScheduleCardProps) => {
  const { t, i18n } = useTranslation()
  const schedules = useLocationSchedules(location.id)
  const remove = useDeleteLocationSchedule(location.id)
  const [changing, setChanging] = useState(false)
  // La versione resta in memoria durante l'animazione di chiusura: il titolo non sparisce
  const [target, setTarget] = useState<WorkSchedule | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const current = location.current_schedule
  const targetDate = target ? formatDay(target.valid_from, i18n.language) : ''

  const confirmDelete = async () => {
    if (!target) return
    try {
      await remove.mutateAsync(target.id)
      toast.success(t('schedule.deleteDialog.done', { date: targetDate }))
    } catch (error) {
      // 409: nel frattempo è entrata in vigore
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    }
    setConfirmOpen(false)
  }

  return (
    <ProfileCard
      titleId="location-schedule-title"
      title={t('schedule.title')}
      description={t('schedule.description')}
      footer={
        <Button className="w-full sm:w-auto" {...{ [LOCATION_DETAIL_TRIGGER_ATTRIBUTE]: 'change-schedule' }} onClick={() => setChanging(true)}>
          {t('schedule.change')}
        </Button>
      }
    >
      <div className="grid gap-4">
        {current ? (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">{t('schedule.since', { date: formatDay(current.valid_from, i18n.language) })}</p>
            <ScheduleSummary minutes={current.minutes} />
          </div>
        ) : (
          <p>{t('schedule.none')}</p>
        )}
        {schedules.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : schedules.isError ? (
          <div role="alert" className="grid justify-items-start gap-2">
            <p>{t('schedule.loadError')}</p>
            <Button variant="outline" onClick={() => void schedules.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <ScheduleVersionsList
            schedules={schedules.data}
            onDelete={(schedule) => {
              setTarget(schedule)
              setConfirmOpen(true)
            }}
          />
        )}
      </div>
      <ScheduleDialog
        open={changing}
        locationId={location.id}
        locationName={location.name}
        timezone={location.timezone}
        initialMinutes={current?.minutes ?? DEFAULT_WEEK}
        currentValidFrom={current?.valid_from}
        onClose={() => setChanging(false)}
      />
      <ConfirmDeleteDialog
        open={confirmOpen}
        title={t('schedule.deleteDialog.title', { date: targetDate })}
        description={t('schedule.deleteDialog.description')}
        actionLabel={t('schedule.deleteDialog.action')}
        pending={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmOpen(false)}
        triggerKey={target ? `schedule-${target.id}` : null}
      />
    </ProfileCard>
  )
}

export default LocationScheduleCard
