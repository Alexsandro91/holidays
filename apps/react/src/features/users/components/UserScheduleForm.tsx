import { LoaderCircle } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useAddUserSchedule, useDeleteUserSchedule, type UserSchedules, type WorkSchedule } from '@/features/locations/api'
import ConfirmDeleteDialog from '@/features/locations/components/ConfirmDeleteDialog'
import ScheduleSummary from '@/features/locations/components/ScheduleSummary'
import ScheduleVersionsList from '@/features/locations/components/ScheduleVersionsList'
import WeeklyScheduleEditor from '@/features/locations/components/WeeklyScheduleEditor'
import { formatDay } from '@/features/locations/dateFormat'
import { DEFAULT_TIMEZONE, DEFAULT_WEEK, todayIn, validateWeek } from '@/features/locations/scheduleFormat'
import type { ManagedUser } from '@/features/users/api'
import { isApiError } from '@/lib/api'

type Mode = 'location' | 'personal'

const isMode = (value: string): value is Mode => value === 'location' || value === 'personal'

interface UserScheduleFormProps {
  user: ManagedUser
  data: UserSchedules
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

/**
 * Orario personale (spec SP2 fase 1 §4.4): "Usa l'orario della sede" o un orario proprio, dal giorno scelto in poi.
 * Parte dalla situazione in vigore: l'orario personale attuale, oppure quello della sede come base da modificare.
 */
const UserScheduleForm = ({ user, data, onClose, onBusyChange }: UserScheduleFormProps) => {
  const { t, i18n } = useTranslation()
  const add = useAddUserSchedule(user.id)
  const remove = useDeleteUserSchedule(user.id)
  // Oggi tutte le sedi sono in Italia: il fuso della sede della persona è quello italiano (il server ricontrolla)
  const [today] = useState(() => todayIn(DEFAULT_TIMEZONE))
  const current = data.schedules.find((schedule) => schedule.is_started)
  const upcoming = data.schedules.filter((schedule) => !schedule.is_started)
  const personalNow = current !== undefined && !current.follows_location
  const [mode, setMode] = useState<Mode>(personalNow ? 'personal' : 'location')
  const [minutes, setMinutes] = useState(personalNow ? current.minutes : (data.location_schedule?.minutes ?? DEFAULT_WEEK))
  const [validFrom, setValidFrom] = useState(today)
  const [errors, setErrors] = useState<{ validFrom?: string; minutes?: string }>({})
  const [target, setTarget] = useState<WorkSchedule | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const submitting = useRef(false)
  // Segue già la sede e non c'è nulla in arrivo: un'altra riga "torna alla sede" non cambierebbe niente
  const alreadyLocation = mode === 'location' && !personalNow && upcoming.length === 0

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current || alreadyLocation) return
    const week = mode === 'personal' ? validateWeek(minutes) : null
    const next = {
      validFrom: validFrom === '' || validFrom < today ? t('schedule.validFromPast') : undefined,
      minutes: week === 'invalidHours' ? t('schedule.weekInvalid') : week === 'noWorkingDay' ? t('schedule.noWorkingDay') : undefined,
    }
    setErrors(next)
    if (next.validFrom || next.minutes) return
    submitting.current = true
    onBusyChange(true)
    try {
      await add.mutateAsync(mode === 'location' ? { validFrom, followsLocation: true } : { validFrom, minutes })
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const minutesError = Object.entries(error.fieldErrors).find(([key]) => key.startsWith('minutes'))?.[1][0]
        setErrors({ validFrom: error.fieldErrors.valid_from?.[0], minutes: minutesError })
        if (!error.fieldErrors.valid_from && !minutesError) toast.error(error.message)
      } else {
        toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
      }
      return
    } finally {
      onBusyChange(false)
    }
    toast.success(t('users.scheduleDialog.saved', { name: user.name, date: formatDay(validFrom, i18n.language) }))
    onClose()
  }

  const confirmDelete = async () => {
    if (!target) return
    try {
      await remove.mutateAsync(target.id)
      toast.success(t('schedule.deleteDialog.done', { date: formatDay(target.valid_from, i18n.language) }))
    } catch (error) {
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    }
    setConfirmOpen(false)
  }

  return (
    <div className="grid gap-6">
      <form onSubmit={(event) => void submit(event)} noValidate>
        <FieldGroup>
          <FieldSet>
            <FieldLegend variant="label">{t('users.scheduleDialog.mode')}</FieldLegend>
            <RadioGroup value={mode} onValueChange={(value) => isMode(value) && setMode(value)}>
              <Field orientation="horizontal">
                <RadioGroupItem value="location" id="user-schedule-location" />
                <FieldLabel htmlFor="user-schedule-location">{t('users.scheduleDialog.useLocation', { location: user.location.name })}</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <RadioGroupItem value="personal" id="user-schedule-personal" />
                <FieldLabel htmlFor="user-schedule-personal">{t('users.scheduleDialog.personal')}</FieldLabel>
              </Field>
            </RadioGroup>
          </FieldSet>
          {mode === 'location' ? (
            <div className="grid gap-2">
              {data.location_schedule && <ScheduleSummary minutes={data.location_schedule.minutes} />}
              {alreadyLocation && <FieldDescription>{t('users.scheduleDialog.alreadyLocation')}</FieldDescription>}
            </div>
          ) : (
            <FieldSet>
              <FieldLegend variant="label">{t('schedule.days')}</FieldLegend>
              <WeeklyScheduleEditor value={minutes} onChange={setMinutes} disabled={add.isPending} />
              {errors.minutes && <FieldError>{errors.minutes}</FieldError>}
            </FieldSet>
          )}
          <Field data-invalid={errors.validFrom ? true : undefined}>
            <FieldLabel htmlFor="user-schedule-valid-from">{t('schedule.validFrom')}</FieldLabel>
            <Input
              id="user-schedule-valid-from"
              type="date"
              min={today}
              value={validFrom}
              className="max-w-48"
              aria-invalid={errors.validFrom ? true : undefined}
              aria-describedby={errors.validFrom ? 'user-schedule-valid-from-error' : undefined}
              onChange={(event) => setValidFrom(event.target.value)}
            />
            <FieldError id="user-schedule-valid-from-error">{errors.validFrom}</FieldError>
          </Field>
        </FieldGroup>
        <DialogFooter className="mt-4">
          <Button type="submit" disabled={add.isPending || alreadyLocation}>
            {add.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {t('users.scheduleDialog.submit')}
          </Button>
        </DialogFooter>
      </form>
      {data.schedules.length > 0 && (
        <ScheduleVersionsList
          schedules={data.schedules}
          onDelete={(schedule) => {
            setTarget(schedule)
            setConfirmOpen(true)
          }}
        />
      )}
      <ConfirmDeleteDialog
        open={confirmOpen}
        title={t('schedule.deleteDialog.title', { date: target ? formatDay(target.valid_from, i18n.language) : '' })}
        description={t('schedule.deleteDialog.description')}
        actionLabel={t('schedule.deleteDialog.action')}
        pending={remove.isPending}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmOpen(false)}
        triggerKey={target ? `schedule-${target.id}` : null}
      />
    </div>
  )
}

export default UserScheduleForm
