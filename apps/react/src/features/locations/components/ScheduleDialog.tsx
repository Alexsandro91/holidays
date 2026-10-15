import { LoaderCircle } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useAddLocationSchedule } from '@/features/locations/api'
import WeeklyScheduleEditor from '@/features/locations/components/WeeklyScheduleEditor'
import { formatDay } from '@/features/locations/dateFormat'
import { proposedValidFrom, todayIn, validateWeek } from '@/features/locations/scheduleFormat'
import { isApiError } from '@/lib/api'
import { focusTrigger, LOCATION_DETAIL_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface ScheduleDialogProps {
  open: boolean
  locationId: number
  locationName: string
  timezone: string
  /** Orario da cui partire: quello in vigore */
  initialMinutes: number[]
  /** Inizio della versione in vigore: se è oggi la data proposta è domani */
  currentValidFrom?: string
  onClose: () => void
}

interface ScheduleFormProps extends Omit<ScheduleDialogProps, 'open' | 'locationName'> {
  onBusyChange: (busy: boolean) => void
}

const ScheduleForm = ({ locationId, timezone, initialMinutes, currentValidFrom, onClose, onBusyChange }: ScheduleFormProps) => {
  const { t, i18n } = useTranslation()
  const add = useAddLocationSchedule(locationId)
  // "Oggi" nel fuso della sede (spec §2.3), fissato all'apertura del dialog
  const [today] = useState(() => todayIn(timezone))
  const [validFrom, setValidFrom] = useState(() => proposedValidFrom(today, currentValidFrom))
  const [minutes, setMinutes] = useState(initialMinutes)
  const [errors, setErrors] = useState<{ validFrom?: string; minutes?: string }>({})
  const submitting = useRef(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current) return
    const week = validateWeek(minutes)
    const next = {
      validFrom: validFrom === '' || validFrom < today ? t('schedule.validFromPast') : undefined,
      minutes: week === 'invalidHours' ? t('schedule.weekInvalid') : week === 'noWorkingDay' ? t('schedule.noWorkingDay') : undefined,
    }
    setErrors(next)
    if (next.validFrom || next.minutes) return
    submitting.current = true
    onBusyChange(true)
    try {
      await add.mutateAsync({ validFrom, minutes })
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
    toast.success(t('schedule.saved', { date: formatDay(validFrom, i18n.language) }))
    onClose()
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <FieldGroup>
        <Field data-invalid={errors.validFrom ? true : undefined}>
          <FieldLabel htmlFor="schedule-valid-from">{t('schedule.validFrom')}</FieldLabel>
          <Input
            id="schedule-valid-from"
            type="date"
            min={today}
            value={validFrom}
            className="max-w-48"
            aria-invalid={errors.validFrom ? true : undefined}
            aria-describedby={errors.validFrom ? 'schedule-valid-from-error' : undefined}
            onChange={(event) => setValidFrom(event.target.value)}
          />
          <FieldError id="schedule-valid-from-error">{errors.validFrom}</FieldError>
        </Field>
        <FieldSet>
          <FieldLegend variant="label">{t('schedule.days')}</FieldLegend>
          <WeeklyScheduleEditor value={minutes} onChange={setMinutes} disabled={add.isPending} />
          {errors.minutes && <FieldError role="alert">{errors.minutes}</FieldError>}
        </FieldSet>
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="submit" disabled={add.isPending}>
          {add.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('schedule.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Nuova versione dell'orario standard: vale dal giorno scelto in poi, mai nel passato (spec §2.3). */
const ScheduleDialog = ({ open, locationName, onClose, ...rest }: ScheduleDialogProps) => {
  const { t } = useTranslation()
  const [openCount, setOpenCount] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount(openCount + 1)
  }
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(LOCATION_DETAIL_TRIGGER_ATTRIBUTE, 'change-schedule')
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('schedule.dialogTitle', { name: locationName })}</DialogTitle>
          <DialogDescription>{t('schedule.dialogDescription')}</DialogDescription>
        </DialogHeader>
        {open && <ScheduleForm key={openCount} onClose={onClose} onBusyChange={setBusy} {...rest} />}
      </DialogContent>
    </Dialog>
  )
}

export default ScheduleDialog
