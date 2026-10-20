import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useProfileAbsenceTypes, type AbsenceTypeOption } from '@/features/absenceTypes/api'
import { formatHours } from '@/features/balances/hoursFormat'
import { dayHalfSchema, leaveUnitSchema, useCreateLeaveRequest, useLeavePreview, type LeaveDraftInput, type LeaveUnit } from '@/features/leave/api'
import { isDateText, TIME_SLOTS, todayLocal, type LeaveDayRange } from '@/features/leave/calendarDates'
import { describeWarning, formatWorkingDays } from '@/features/leave/describeRequest'
import { formatDayRange } from '@/features/locations/dateFormat'
import { isApiError } from '@/lib/api'
import { focusTrigger, LEAVE_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

const NOTE_MAX_LENGTH = 500

const createSchema = (t: TFunction, today: string) =>
  z
    .object({
      absenceTypeId: z.string().min(1, t('leave.form.validation.type')),
      unit: leaveUnitSchema,
      startsOn: z.string(),
      endsOn: z.string(),
      half: dayHalfSchema,
      startsAt: z.string(),
      endsAt: z.string(),
      note: z.string().max(NOTE_MAX_LENGTH, t('validation.tooLong', { max: NOTE_MAX_LENGTH })),
    })
    .superRefine((values, context) => {
      const issue = (path: string, key: string) => context.addIssue({ code: 'custom', path: [path], message: t(`leave.form.validation.${key}`) })
      if (!isDateText(values.startsOn)) issue('startsOn', 'date')
      else if (values.startsOn < today) issue('startsOn', 'past')
      if (values.unit === 'days') {
        if (!isDateText(values.endsOn)) issue('endsOn', 'date')
        else if (isDateText(values.startsOn) && values.endsOn < values.startsOn) issue('endsOn', 'endBeforeStart')
      }
      if (values.unit === 'hours') {
        if (values.startsAt === '') issue('startsAt', 'time')
        if (values.endsAt === '') issue('endsAt', 'time')
        else if (values.startsAt !== '' && values.endsAt <= values.startsAt) issue('endsAt', 'timeOrder')
      }
    })

type FormValues = z.infer<ReturnType<typeof createSchema>>
type FieldName = keyof FormValues

const UNITS: readonly LeaveUnit[] = leaveUnitSchema.options
const HALVES = dayHalfSchema.options

/** Chiavi con cui il server indica gli errori dei campi (spec §5.1). */
const SERVER_FIELDS = new Map<string, FieldName>([
  ['absence_type_id', 'absenceTypeId'],
  ['unit', 'unit'],
  ['starts_on', 'startsOn'],
  ['ends_on', 'endsOn'],
  ['half', 'half'],
  ['starts_at', 'startsAt'],
  ['ends_at', 'endsAt'],
  ['note', 'note'],
])

const FIELD_ORDER: readonly FieldName[] = ['absenceTypeId', 'unit', 'startsOn', 'endsOn', 'half', 'startsAt', 'endsAt', 'note']

const allowsUnit = (type: AbsenceTypeOption, unit: LeaveUnit): boolean =>
  unit === 'days' ? type.allows_days : unit === 'half_day' ? type.allows_half_days : type.allows_hours

/** Campi mostrati per l'unità: l'ultimo giorno solo per le giornate, la metà e gli orari solo per la loro unità. */
const isShown = (field: FieldName, unit: LeaveUnit): boolean =>
  field === 'endsOn' ? unit === 'days' : field === 'half' ? unit === 'half_day' : field === 'startsAt' || field === 'endsAt' ? unit === 'hours' : true

/** Errori del server sui campi mostrati; `ends_on` di una richiesta di un giorno solo va sul giorno. */
const serverErrors = (fieldErrors: Record<string, string[]>, unit: LeaveUnit): Partial<Record<FieldName, string>> => {
  const result: Partial<Record<FieldName, string>> = {}
  for (const [key, messages] of Object.entries(fieldErrors)) {
    const field = SERVER_FIELDS.get(key)
    if (field === undefined || messages[0] === undefined) continue
    const target = field === 'endsOn' && unit !== 'days' ? 'startsOn' : field
    if (isShown(target, unit) && result[target] === undefined) result[target] = messages[0]
  }
  return result
}

/** Bozza nel formato dell'API, senza la nota: l'anteprima non deve ripartire a ogni carattere. */
const toDraft = (values: FormValues): LeaveDraftInput => {
  const base = { absence_type_id: Number(values.absenceTypeId), unit: values.unit, starts_on: values.startsOn, ends_on: values.unit === 'days' ? values.endsOn : values.startsOn }
  if (values.unit === 'half_day') return { ...base, half: values.half }
  if (values.unit === 'hours') return { ...base, starts_at: values.startsAt, ends_at: values.endsAt }
  return base
}

/** Passa al campo solo i valori che lo schema riconosce (le Select e i RadioGroup di Radix danno stringhe). */
const choose =
  <T,>(schema: z.ZodType<T>, onChange: (value: T) => void) =>
  (value: string) => {
    const parsed = schema.safeParse(value)
    if (parsed.success) onChange(parsed.data)
  }

interface RequestFormProps {
  range: LeaveDayRange | null
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

/** Il form si monta a ogni apertura, con i giorni scelti sul calendario (o vuoto). */
const RequestForm = ({ range, onClose, onBusyChange }: RequestFormProps) => {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const today = todayLocal()
  const types = useProfileAbsenceTypes()
  const create = useCreateLeaveRequest()
  const schema = useMemo(() => createSchema(t, today), [t, today])
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { absenceTypeId: '', unit: 'days', startsOn: range?.startsOn ?? '', endsOn: range?.endsOn ?? '', half: 'morning', startsAt: '', endsAt: '', note: '' },
  })
  const { errors } = form.formState
  const watched = useWatch({ control: form.control })
  const unit = watched.unit ?? 'days'
  const selectedType = types.data?.find((type) => String(type.id) === watched.absenceTypeId)
  // Evita il doppio invio: letto solo nei gestori di evento
  const submitting = useRef(false)

  // Bozza completa e valida (senza nota) per l'anteprima; altrimenti nessuna lettura
  const parsed = schema.safeParse({ ...watched, note: '' })
  const draft = parsed.success ? toDraft(parsed.data) : null
  const preview = useLeavePreview(draft)
  // Con keepPreviousData l'anteprima di una bozza precedente resta visibile: non vale per quella attuale
  const previewCurrent = draft !== null && preview.data !== undefined && !preview.isPlaceholderData ? preview.data : null
  const previewLoading = draft !== null && (preview.isPending || preview.isPlaceholderData)
  const previewErrors = draft !== null && isApiError(preview.error, 'validation') ? serverErrors(preview.error.fieldErrors, unit) : {}

  const fieldError = (field: FieldName): string | undefined => errors[field]?.message ?? previewErrors[field]
  const describedBy = (field: FieldName, ...ids: (string | false)[]): string | undefined => {
    const all = [...ids.filter((id) => id !== false), fieldError(field) === undefined ? false : `leave-${field}-error`].filter((id) => id !== false)
    return all.length === 0 ? undefined : all.join(' ')
  }

  const changeType = (value: string, onChange: (value: string) => void) => {
    onChange(value)
    const type = types.data?.find((item) => String(item.id) === value)
    const current = form.getValues('unit')
    if (type === undefined || allowsUnit(type, current)) return
    const first = UNITS.find((item) => allowsUnit(type, item))
    if (first !== undefined) form.setValue('unit', first)
  }

  const submit = async (values: FormValues) => {
    if (submitting.current) return
    submitting.current = true
    onBusyChange(true)
    const note = values.note.trim()
    try {
      const created = await create.mutateAsync({ ...toDraft(values), ...(note === '' ? {} : { note }) })
      const texts = { type: created.absence_type.name, dates: formatDayRange(created.starts_on, created.ends_on, language) }
      toast.success(t(created.status === 'approved' ? 'leave.form.createdApproved' : 'leave.form.created', texts))
      onClose()
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const messages = serverErrors(error.fieldErrors, values.unit)
        const fields = FIELD_ORDER.filter((field) => messages[field] !== undefined)
        fields.forEach((field) => form.setError(field, { type: 'server', message: messages[field] }))
        if (fields[0] !== undefined) form.setFocus(fields[0])
        else toast.error(error.message)
        return
      }
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    } finally {
      onBusyChange(false)
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(submit)(event)

  const typeError = fieldError('absenceTypeId')
  const startsOnError = fieldError('startsOn')
  const endsOnError = fieldError('endsOn')

  const typeField = () => {
    if (types.isError) {
      return (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p>{t('leave.form.typesError')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void types.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )
    }
    if (types.data !== undefined && types.data.length === 0) return <p className="text-muted-foreground">{t('leave.form.typesEmpty')}</p>
    return (
      <Controller
        control={form.control}
        name="absenceTypeId"
        render={({ field }) => (
          <Select value={field.value} onValueChange={(value) => changeType(value, field.onChange)} disabled={types.data === undefined}>
            <SelectTrigger
              id="leave-absenceTypeId"
              ref={field.ref}
              className="w-full"
              aria-invalid={typeError ? true : undefined}
              aria-describedby={describedBy('absenceTypeId')}
            >
              <SelectValue placeholder={types.data === undefined ? t('leave.form.typesLoading') : t('leave.form.typePlaceholder')} />
            </SelectTrigger>
            <SelectContent position="popper">
              {(types.data ?? []).map((type) => (
                <SelectItem key={type.id} value={String(type.id)}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    )
  }

  const timeField = (name: 'startsAt' | 'endsAt') => {
    const error = fieldError(name)
    return (
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={`leave-${name}`}>{t(`leave.form.${name}`)}</FieldLabel>
        <Controller
          control={form.control}
          name={name}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id={`leave-${name}`} ref={field.ref} className="w-full" aria-invalid={error ? true : undefined} aria-describedby={describedBy(name)}>
                <SelectValue placeholder={t('leave.form.timePlaceholder')} />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-64">
                {TIME_SLOTS.map((slot) => (
                  <SelectItem key={slot} value={slot}>
                    {slot}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError id={`leave-${name}-error`}>{error}</FieldError>
      </Field>
    )
  }

  const previewBody = () => {
    if (draft === null) return <p className="text-muted-foreground">{t('leave.preview.incomplete')}</p>
    if (previewLoading) return <p className="text-muted-foreground">{t('leave.preview.loading')}</p>
    if (previewCurrent === null) {
      if (isApiError(preview.error, 'validation')) return <p className="text-muted-foreground">{t('leave.preview.invalid')}</p>
      return (
        <div className="flex flex-wrap items-center gap-3">
          <p>{t('leave.preview.error')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void preview.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )
    }
    const balanceName = previewCurrent.balance === null ? null : t(`accrual.balances.${previewCurrent.balance.balance}`)
    return (
      <div className="grid gap-3">
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt className="text-muted-foreground">{t('leave.preview.hours')}</dt>
          <dd className="text-right font-medium tabular-nums">{t('leave.preview.hoursValue', { hours: formatHours(previewCurrent.minutes, language) })}</dd>
          <dt className="text-muted-foreground">{t('leave.preview.days')}</dt>
          <dd className="text-right font-medium tabular-nums">{formatWorkingDays(previewCurrent.working_days, language)}</dd>
          {previewCurrent.balance !== null && balanceName !== null && (
            <>
              <dt className="text-muted-foreground">{t('leave.preview.available', { balance: balanceName })}</dt>
              <dd className="text-right font-medium tabular-nums">{t('leave.preview.hoursValue', { hours: formatHours(previewCurrent.balance.available_minutes, language) })}</dd>
              <dt className="text-muted-foreground">{t('leave.preview.after', { balance: balanceName })}</dt>
              <dd className="text-right font-medium tabular-nums">{t('leave.preview.hoursValue', { hours: formatHours(previewCurrent.balance.after_minutes, language) })}</dd>
            </>
          )}
        </dl>
        {previewCurrent.warnings.length > 0 && (
          <div className="grid gap-1.5 rounded-md border border-leave-pending-foreground/30 bg-leave-pending p-3 text-leave-pending-foreground">
            <p className="flex items-center gap-1.5 font-medium">
              <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
              {t('leave.warnings.title')}
            </p>
            <ul className="grid list-disc gap-1 pl-5">
              {previewCurrent.warnings.map((warning) => (
                <li key={warning.code}>{describeWarning(warning, t, language)}</li>
              ))}
            </ul>
            <p className="text-xs">{t('leave.warnings.hint')}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={typeError ? true : undefined}>
          <FieldLabel htmlFor="leave-absenceTypeId">{t('leave.form.type')}</FieldLabel>
          {typeField()}
          <FieldError id="leave-absenceTypeId-error">{typeError}</FieldError>
        </Field>

        {selectedType !== undefined && (
          <FieldSet>
            <FieldLegend id="leave-unit-legend" variant="label">
              {t('leave.form.unit')}
            </FieldLegend>
            <Controller
              control={form.control}
              name="unit"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={choose(leaveUnitSchema, field.onChange)} aria-labelledby="leave-unit-legend" aria-describedby={describedBy('unit')}>
                  {UNITS.filter((item) => allowsUnit(selectedType, item)).map((item, index) => (
                    <Field key={item} orientation="horizontal">
                      <RadioGroupItem ref={index === 0 ? field.ref : undefined} id={`leave-unit-${item}`} value={item} />
                      <FieldLabel htmlFor={`leave-unit-${item}`} className="font-normal">
                        {t(`leave.form.units.${item}`)}
                      </FieldLabel>
                    </Field>
                  ))}
                </RadioGroup>
              )}
            />
            <FieldError id="leave-unit-error">{fieldError('unit')}</FieldError>
          </FieldSet>
        )}

        {unit === 'days' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={startsOnError ? true : undefined}>
              <FieldLabel htmlFor="leave-startsOn">{t('leave.form.startsOn')}</FieldLabel>
              <Input id="leave-startsOn" type="date" min={today} aria-invalid={startsOnError ? true : undefined} aria-describedby={describedBy('startsOn')} {...form.register('startsOn')} />
              <FieldError id="leave-startsOn-error">{startsOnError}</FieldError>
            </Field>
            <Field data-invalid={endsOnError ? true : undefined}>
              <FieldLabel htmlFor="leave-endsOn">{t('leave.form.endsOn')}</FieldLabel>
              <Input
                id="leave-endsOn"
                type="date"
                min={isDateText(watched.startsOn ?? '') ? watched.startsOn : today}
                aria-invalid={endsOnError ? true : undefined}
                aria-describedby={describedBy('endsOn')}
                {...form.register('endsOn')}
              />
              <FieldError id="leave-endsOn-error">{endsOnError}</FieldError>
            </Field>
          </div>
        ) : (
          <Field data-invalid={startsOnError ? true : undefined}>
            <FieldLabel htmlFor="leave-startsOn">{t('leave.form.day')}</FieldLabel>
            <Input
              id="leave-startsOn"
              type="date"
              min={today}
              aria-invalid={startsOnError ? true : undefined}
              aria-describedby={describedBy('startsOn', 'leave-single-day')}
              {...form.register('startsOn')}
            />
            <FieldDescription id="leave-single-day">{t('leave.form.singleDay')}</FieldDescription>
            <FieldError id="leave-startsOn-error">{startsOnError}</FieldError>
          </Field>
        )}

        {unit === 'half_day' && (
          <FieldSet>
            <FieldLegend id="leave-half-legend" variant="label">
              {t('leave.form.half')}
            </FieldLegend>
            <Controller
              control={form.control}
              name="half"
              render={({ field }) => (
                <RadioGroup value={field.value} onValueChange={choose(dayHalfSchema, field.onChange)} aria-labelledby="leave-half-legend" className="flex flex-wrap gap-4">
                  {HALVES.map((item, index) => (
                    <Field key={item} orientation="horizontal" className="w-auto">
                      <RadioGroupItem ref={index === 0 ? field.ref : undefined} id={`leave-half-${item}`} value={item} />
                      <FieldLabel htmlFor={`leave-half-${item}`} className="font-normal">
                        {t(`leave.form.halves.${item}`)}
                      </FieldLabel>
                    </Field>
                  ))}
                </RadioGroup>
              )}
            />
            <FieldError id="leave-half-error">{fieldError('half')}</FieldError>
          </FieldSet>
        )}

        {unit === 'hours' && (
          <div className="grid gap-4 sm:grid-cols-2">
            {timeField('startsAt')}
            {timeField('endsAt')}
          </div>
        )}

        <Field data-invalid={fieldError('note') ? true : undefined}>
          <FieldLabel htmlFor="leave-note">{t('leave.form.note')}</FieldLabel>
          <Textarea
            id="leave-note"
            maxLength={NOTE_MAX_LENGTH}
            rows={2}
            aria-invalid={fieldError('note') ? true : undefined}
            aria-describedby={describedBy('note', 'leave-note-hint')}
            {...form.register('note')}
          />
          <FieldDescription id="leave-note-hint">{t('leave.form.noteHint', { max: NOTE_MAX_LENGTH })}</FieldDescription>
          <FieldError id="leave-note-error">{fieldError('note')}</FieldError>
        </Field>

        <section aria-labelledby="leave-preview-title" className="grid gap-2 rounded-lg border border-border bg-muted/40 p-3">
          <h3 id="leave-preview-title" className="font-medium">
            {t('leave.preview.title')}
          </h3>
          <div aria-live="polite">{previewBody()}</div>
        </section>
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="submit" disabled={create.isPending || previewLoading}>
          {create.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('leave.form.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

interface LeaveRequestDialogProps {
  open: boolean
  /** Giorni scelti sul calendario; null = da compilare con i due campi data */
  range: LeaveDayRange | null
  /** Valore di LEAVE_TRIGGER_ATTRIBUTE dell'elemento che riprende il focus alla chiusura (null = titolo della pagina) */
  returnFocusTo: string | null
  onClose: () => void
}

/** Nuova richiesta (spec §7.2): tipo, unità, giorni, nota, con l'anteprima di ore, giorni, saldo e avvisi. */
const LeaveRequestDialog = ({ open, range, returnFocusTo, onClose }: LeaveRequestDialogProps) => {
  const { t } = useTranslation()
  // Conta le aperture: ogni apertura rimonta il form
  const [openCount, setOpenCount] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount(openCount + 1)
  }
  // Durante l'invio il dialog non si chiude (Escape, clic fuori)
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(LEAVE_TRIGGER_ATTRIBUTE, returnFocusTo)
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('leave.form.title')}</DialogTitle>
          <DialogDescription>{t('leave.form.description')}</DialogDescription>
        </DialogHeader>
        {open && <RequestForm key={openCount} range={range} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  )
}

export default LeaveRequestDialog
