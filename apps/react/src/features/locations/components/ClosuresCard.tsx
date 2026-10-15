import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useClosures, useDeleteClosure, type Closure, type LocationDetail } from '@/features/locations/api'
import ClosureDialog from '@/features/locations/components/ClosureDialog'
import ConfirmDeleteDialog from '@/features/locations/components/ConfirmDeleteDialog'
import LocationBadge from '@/features/locations/components/LocationBadge'
import YearSelect from '@/features/locations/components/YearSelect'
import { formatDay } from '@/features/locations/dateFormat'
import { todayIn } from '@/features/locations/scheduleFormat'
import ProfileCard from '@/features/profile/components/ProfileCard'
import { isApiError } from '@/lib/api'
import { LOCATION_DETAIL_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface ClosuresCardProps {
  location: LocationDetail
}

/** Chiusure dell'anno scelto: quelle della sede e quelle di tutte le sedi, con il loro badge (spec §5.3). */
const ClosuresCard = ({ location }: ClosuresCardProps) => {
  const { t, i18n } = useTranslation()
  const [currentYear] = useState(() => Number(todayIn(location.timezone).slice(0, 4)))
  const [year, setYear] = useState(currentYear)
  const closures = useClosures(year, location.id)
  const remove = useDeleteClosure()
  const [editing, setEditing] = useState<{ open: boolean; closure: Closure | null }>({ open: false, closure: null })
  const [target, setTarget] = useState<Closure | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const period = (closure: Closure): string =>
    closure.starts_on === closure.ends_on
      ? formatDay(closure.starts_on, i18n.language)
      : t('closures.period', { from: formatDay(closure.starts_on, i18n.language), to: formatDay(closure.ends_on, i18n.language) })

  const confirmDelete = async () => {
    if (!target) return
    try {
      await remove.mutateAsync(target.id)
      toast.success(t('closures.deleteDialog.done'))
    } catch (error) {
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    }
    setConfirmOpen(false)
  }

  return (
    <ProfileCard
      titleId="location-closures-title"
      title={t('closures.title')}
      description={t('closures.description')}
      footer={
        <Button className="w-full sm:w-auto" {...{ [LOCATION_DETAIL_TRIGGER_ATTRIBUTE]: 'add-closure' }} onClick={() => setEditing({ open: true, closure: null })}>
          {t('closures.add')}
        </Button>
      }
    >
      <div className="grid gap-4">
        <YearSelect id="closures-year" label={t('closures.year')} value={year} years={[currentYear - 1, currentYear, currentYear + 1, currentYear + 2]} onChange={setYear} />
        {closures.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : closures.isError ? (
          <div role="alert" className="grid justify-items-start gap-2">
            <p>{t('closures.loadError')}</p>
            <Button variant="outline" onClick={() => void closures.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : closures.data.length === 0 ? (
          <p className="text-muted-foreground">{t('closures.empty')}</p>
        ) : (
          <ul className="grid gap-2" aria-busy={closures.isPlaceholderData || undefined}>
            {closures.data.map((closure) => (
              <li key={closure.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div className="grid gap-1">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {closure.description}
                    {closure.location_id === null && <LocationBadge kind="allLocations" />}
                  </span>
                  <span className="text-sm text-muted-foreground">{period(closure)}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t('closures.editFor', { description: closure.description })}
                    {...{ [LOCATION_DETAIL_TRIGGER_ATTRIBUTE]: `closure-edit-${closure.id}` }}
                    onClick={() => setEditing({ open: true, closure })}
                  >
                    {t('closures.edit')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={t('closures.deleteFor', { description: closure.description })}
                    {...{ [LOCATION_DETAIL_TRIGGER_ATTRIBUTE]: `closure-delete-${closure.id}` }}
                    onClick={() => {
                      setTarget(closure)
                      setConfirmOpen(true)
                    }}
                  >
                    {t('closures.delete')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ClosureDialog open={editing.open} locationId={location.id} closure={editing.closure} onClose={() => setEditing((current) => ({ ...current, open: false }))} />
      <ConfirmDeleteDialog
        open={confirmOpen}
        title={t('closures.deleteDialog.title', { description: target?.description ?? '' })}
        description={target?.location_id === null ? t('closures.deleteDialog.descriptionAll') : t('closures.deleteDialog.description')}
        actionLabel={t('closures.deleteDialog.action')}
        pending={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmOpen(false)}
        triggerKey={target ? `closure-delete-${target.id}` : null}
      />
    </ProfileCard>
  )
}

export default ClosuresCard
