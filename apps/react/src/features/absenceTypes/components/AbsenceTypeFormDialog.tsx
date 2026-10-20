import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateAbsenceType, useUpdateAbsenceType, type AbsenceType, type AbsenceTypeInput } from '@/features/absenceTypes/api'
import AbsenceTypeCheckboxField from '@/features/absenceTypes/components/AbsenceTypeCheckboxField'
import { balanceTypeSchema, BALANCE_TYPES } from '@/features/balances/api'
import { isApiError } from '@/lib/api'
import { ABSENCE_TYPE_TRIGGER_ATTRIBUTE, focusTrigger, NEW_ABSENCE_TYPE_TRIGGER } from '@/lib/focusTrigger'

const NAME_MAX_LENGTH = 100
const LIMIT_MAX = 65535
const employmentSchema = z.enum(['employee', 'contractor', 'intern'])
const EMPLOYMENT_TYPES = employmentSchema.options
const balanceChoiceSchema = z.union([z.literal('none'), balanceTypeSchema])
const dayCountSchema = z.enum(['working', 'calendar'])
const limitUnitSchema = z.enum(['days', 'hours'])
const limitPeriodSchema = z.enum(['month', 'year', 'request'])

const createSchema = (t: TFunction) =>
  z
    .object({
      name: z.string().trim().min(1, t('absenceTypes.validation.nameRequired')).max(NAME_MAX_LENGTH, t('validation.tooLong', { max: NAME_MAX_LENGTH })),
      allowsDays: z.boolean(),
      allowsHalfDays: z.boolean(),
      allowsHours: z.boolean(),
      balance: balanceChoiceSchema,
      requiresApproval: z.boolean(),
      employmentTypes: z.array(employmentSchema),
      requiresEnablement: z.boolean(),
      dayCount: dayCountSchema,
      requiresCertificate: z.boolean(),
      limitAmount: z.string().trim(),
      limitUnit: limitUnitSchema,
      limitPeriod: limitPeriodSchema,
    })
    .superRefine((values, context) => {
      if (!values.allowsDays && !values.allowsHalfDays && !values.allowsHours) {
        context.addIssue({ code: 'custom', path: ['allowsDays'], message: t('absenceTypes.validation.unitRequired') })
      } else if (values.allowsHalfDays && !values.allowsDays) {
        context.addIssue({ code: 'custom', path: ['allowsHalfDays'], message: t('absenceTypes.validation.halfDaysNeedDays') })
      }
      // Con un saldo il tipo vale solo per i dipendenti, qualunque sia la selezione
      if (values.balance === 'none' && values.employmentTypes.length === 0) {
        context.addIssue({ code: 'custom', path: ['employmentTypes'], message: t('absenceTypes.validation.employmentRequired') })
      }
      if (values.limitAmount !== '') {
        const amount = Number(values.limitAmount)
        if (!/^\d+$/.test(values.limitAmount) || amount < 1 || amount > LIMIT_MAX) {
          context.addIssue({ code: 'custom', path: ['limitAmount'], message: t('absenceTypes.validation.limitInvalid') })
        }
      }
    })

type AbsenceTypeValues = z.infer<ReturnType<typeof createSchema>>

const FIELDS: (keyof AbsenceTypeValues)[] = [
  'name',
  'allowsDays',
  'allowsHalfDays',
  'allowsHours',
  'balance',
  'employmentTypes',
  'dayCount',
  'limitAmount',
  'limitUnit',
  'limitPeriod',
]

/** Chiavi con cui il server indica gli errori di ciascun campo del form. */
const SERVER_KEYS: Record<keyof AbsenceTypeValues, string[]> = {
  name: ['name'],
  allowsDays: ['allows_days'],
  allowsHalfDays: ['allows_half_days'],
  allowsHours: ['allows_hours'],
  balance: ['balance'],
  requiresApproval: ['requires_approval'],
  employmentTypes: ['employment_types'],
  requiresEnablement: ['requires_enablement'],
  dayCount: ['day_count'],
  requiresCertificate: ['requires_certificate'],
  limitAmount: ['limit', 'limit.amount'],
  limitUnit: ['limit.unit'],
  limitPeriod: ['limit.period'],
}

const serverMessage = (fieldErrors: Record<string, string[]>, field: keyof AbsenceTypeValues): string | undefined => {
  for (const [key, messages] of Object.entries(fieldErrors)) {
    if (SERVER_KEYS[field].some((prefix) => key === prefix || key.startsWith(`${prefix}.`)) && messages[0]) return messages[0]
  }
  return undefined
}

const defaultValues = (type: AbsenceType | null): AbsenceTypeValues =>
  type === null
    ? {
        name: '',
        allowsDays: false,
        allowsHalfDays: false,
        allowsHours: false,
        balance: 'none',
        requiresApproval: true,
        employmentTypes: [...EMPLOYMENT_TYPES],
        requiresEnablement: false,
        dayCount: 'working',
        requiresCertificate: false,
        limitAmount: '',
        limitUnit: 'days',
        limitPeriod: 'month',
      }
    : {
        name: type.name,
        allowsDays: type.allows_days,
        allowsHalfDays: type.allows_half_days,
        allowsHours: type.allows_hours,
        balance: type.balance ?? 'none',
        requiresApproval: type.requires_approval,
        employmentTypes: type.employment_types,
        requiresEnablement: type.requires_enablement,
        dayCount: type.day_count,
        requiresCertificate: type.requires_certificate,
        limitAmount: type.limit === null ? '' : String(type.limit.amount),
        limitUnit: type.limit?.unit ?? 'days',
        limitPeriod: type.limit?.period ?? 'month',
      }

/** Valori del form nel formato dell'API; con un saldo il tipo vale solo per i dipendenti. */
const toInput = (values: AbsenceTypeValues): AbsenceTypeInput => ({
  name: values.name,
  allowsDays: values.allowsDays,
  allowsHalfDays: values.allowsHalfDays,
  allowsHours: values.allowsHours,
  balance: values.balance === 'none' ? null : values.balance,
  requiresApproval: values.requiresApproval,
  employmentTypes: values.balance === 'none' ? EMPLOYMENT_TYPES.filter((item) => values.employmentTypes.includes(item)) : ['employee'],
  requiresEnablement: values.requiresEnablement,
  dayCount: values.dayCount,
  requiresCertificate: values.requiresCertificate,
  limit: values.limitAmount === '' ? null : { amount: Number(values.limitAmount), unit: values.limitUnit, period: values.limitPeriod },
})

/** Passa al campo solo i valori che lo schema riconosce (le Select di Radix danno stringhe). */
const choose =
  <T,>(schema: z.ZodType<T>, onChange: (value: T) => void) =>
  (value: string) => {
    const parsed = schema.safeParse(value)
    if (parsed.success) onChange(parsed.data)
  }

interface AbsenceTypeFormDialogProps {
  open: boolean
  /** null = nuovo tipo */
  absenceType: AbsenceType | null
  onClose: () => void
}

interface AbsenceTypeFormProps {
  absenceType: AbsenceType | null
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

/** Il form si monta a ogni apertura: parte dai dati attuali (o dai valori di partenza), senza errori. */
const AbsenceTypeForm = ({ absenceType, onClose, onBusyChange }: AbsenceTypeFormProps) => {
  const { t } = useTranslation()
  const create = useCreateAbsenceType()
  const update = useUpdateAbsenceType()
  const pending = create.isPending || update.isPending
  const schema = useMemo(() => createSchema(t), [t])
  const form = useForm<AbsenceTypeValues>({ resolver: zodResolver(schema), defaultValues: defaultValues(absenceType) })
  const { errors } = form.formState
  const balance = form.watch('balance')
  const employeesOnly = balance !== 'none'
  // Evita il doppio invio: letto solo nei gestori di evento
  const submitting = useRef(false)

  const submit = async (values: AbsenceTypeValues) => {
    if (submitting.current) return
    submitting.current = true
    onBusyChange(true)
    const input = toInput(values)
    try {
      let name = input.name
      if (absenceType === null) {
        name = (await create.mutateAsync(input)).name
      } else {
        // Il nome si invia solo se cambiato: così un tipo di partenza non rinominato resta col nome tradotto
        const { name: sent, ...rest } = input
        name = (await update.mutateAsync({ id: absenceType.id, ...rest, ...(sent !== absenceType.name ? { name: sent } : {}) })).name
      }
      toast.success(absenceType === null ? t('absenceTypes.form.created', { name }) : t('absenceTypes.form.updated', { name }))
      onClose()
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const messages = FIELDS.map((field) => ({ field, message: serverMessage(error.fieldErrors, field) }))
        messages.forEach(({ field, message }) => {
          if (message) form.setError(field, { message })
        })
        const first = messages.find(({ message }) => message !== undefined)
        if (first) form.setFocus(first.field)
        else toast.error(error.message)
        return
      }
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    } finally {
      onBusyChange(false)
    }
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(submit)(event)

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="absence-type-name">{t('absenceTypes.form.name')}</FieldLabel>
          <Input
            id="absence-type-name"
            autoComplete="off"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'absence-type-name-error' : undefined}
            {...form.register('name')}
          />
          <FieldError id="absence-type-name-error">{errors.name?.message}</FieldError>
        </Field>

        <FieldSet>
          <FieldLegend variant="label">{t('absenceTypes.form.request')}</FieldLegend>
          <Controller
            control={form.control}
            name="allowsDays"
            render={({ field }) => (
              <AbsenceTypeCheckboxField
                id="absence-type-days"
                ref={field.ref}
                label={t('absenceTypes.units.days')}
                checked={field.value}
                onCheckedChange={field.onChange}
                invalid={errors.allowsDays !== undefined}
                describedBy={errors.allowsDays ? 'absence-type-request-error' : undefined}
              />
            )}
          />
          <Controller
            control={form.control}
            name="allowsHalfDays"
            render={({ field }) => (
              <AbsenceTypeCheckboxField
                id="absence-type-half-days"
                ref={field.ref}
                label={t('absenceTypes.units.halfDays')}
                checked={field.value}
                onCheckedChange={field.onChange}
                invalid={errors.allowsHalfDays !== undefined}
                describedBy={errors.allowsHalfDays ? 'absence-type-request-error' : undefined}
              />
            )}
          />
          <Controller
            control={form.control}
            name="allowsHours"
            render={({ field }) => (
              <AbsenceTypeCheckboxField
                id="absence-type-hours"
                ref={field.ref}
                label={t('absenceTypes.units.hours')}
                checked={field.value}
                onCheckedChange={field.onChange}
                invalid={errors.allowsHours !== undefined}
                describedBy={errors.allowsHours ? 'absence-type-request-error' : undefined}
              />
            )}
          />
          <FieldError id="absence-type-request-error">{errors.allowsDays?.message ?? errors.allowsHalfDays?.message ?? errors.allowsHours?.message}</FieldError>
        </FieldSet>

        <Controller
          control={form.control}
          name="requiresApproval"
          render={({ field }) => (
            <AbsenceTypeCheckboxField id="absence-type-approval" ref={field.ref} label={t('absenceTypes.form.approval')} checked={field.value} onCheckedChange={field.onChange} />
          )}
        />

        <Field data-invalid={errors.balance ? true : undefined}>
          <FieldLabel htmlFor="absence-type-balance">{t('absenceTypes.form.balance')}</FieldLabel>
          <Controller
            control={form.control}
            name="balance"
            render={({ field }) => (
              <Select value={field.value} onValueChange={choose(balanceChoiceSchema, field.onChange)}>
                <SelectTrigger
                  id="absence-type-balance"
                  ref={field.ref}
                  className="w-full"
                  aria-invalid={errors.balance ? true : undefined}
                  aria-describedby={errors.balance ? 'absence-type-balance-hint absence-type-balance-error' : 'absence-type-balance-hint'}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="none">{t('absenceTypes.balances.none')}</SelectItem>
                  {BALANCE_TYPES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {t(`absenceTypes.balances.${item}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldDescription id="absence-type-balance-hint">{t('absenceTypes.form.balanceHint')}</FieldDescription>
          <FieldError id="absence-type-balance-error">{errors.balance?.message}</FieldError>
        </Field>

        <FieldSet>
          <FieldLegend variant="label">{t('absenceTypes.form.employment')}</FieldLegend>
          <Controller
            control={form.control}
            name="employmentTypes"
            render={({ field }) => (
              <>
                {EMPLOYMENT_TYPES.map((item, index) => (
                  <AbsenceTypeCheckboxField
                    key={item}
                    ref={index === 0 ? field.ref : undefined}
                    id={`absence-type-employment-${item}`}
                    label={t(`absenceTypes.employment.${item}`)}
                    // Con un saldo si vede solo Dipendenti, spento e bloccato; il valore scelto prima torna se il saldo si toglie
                    checked={employeesOnly ? item === 'employee' : field.value.includes(item)}
                    disabled={employeesOnly}
                    invalid={errors.employmentTypes !== undefined}
                    describedBy={employeesOnly ? 'absence-type-employees-only' : errors.employmentTypes ? 'absence-type-employment-error' : undefined}
                    onCheckedChange={(checked) => field.onChange(checked ? [...field.value, item] : field.value.filter((value) => value !== item))}
                  />
                ))}
              </>
            )}
          />
          {employeesOnly && <FieldDescription id="absence-type-employees-only">{t('absenceTypes.form.employeesOnly')}</FieldDescription>}
          <FieldError id="absence-type-employment-error">{errors.employmentTypes?.message}</FieldError>
        </FieldSet>

        <Controller
          control={form.control}
          name="requiresEnablement"
          render={({ field }) => (
            <AbsenceTypeCheckboxField id="absence-type-enablement" ref={field.ref} label={t('absenceTypes.form.requiresEnablement')} checked={field.value} onCheckedChange={field.onChange} />
          )}
        />

        <FieldSet>
          <FieldLegend variant="label">{t('absenceTypes.form.dayCount')}</FieldLegend>
          <Controller
            control={form.control}
            name="dayCount"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={choose(dayCountSchema, field.onChange)} aria-label={t('absenceTypes.form.dayCount')}>
                {dayCountSchema.options.map((item, index) => (
                  <Field key={item} orientation="horizontal">
                    <RadioGroupItem ref={index === 0 ? field.ref : undefined} id={`absence-type-day-count-${item}`} value={item} />
                    <FieldLabel htmlFor={`absence-type-day-count-${item}`} className="font-normal">
                      {t(`absenceTypes.form.${item}`)}
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            )}
          />
        </FieldSet>

        <Controller
          control={form.control}
          name="requiresCertificate"
          render={({ field }) => (
            <AbsenceTypeCheckboxField
              id="absence-type-certificate"
              ref={field.ref}
              label={t('absenceTypes.form.requiresCertificate')}
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />

        <FieldSet>
          <FieldLegend variant="label">{t('absenceTypes.form.limit')}</FieldLegend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field data-invalid={errors.limitAmount ? true : undefined}>
              <FieldLabel htmlFor="absence-type-limit-amount">{t('absenceTypes.form.limitAmount')}</FieldLabel>
              <Input
                id="absence-type-limit-amount"
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={errors.limitAmount ? true : undefined}
                aria-describedby={errors.limitAmount ? 'absence-type-limit-hint absence-type-limit-error' : 'absence-type-limit-hint'}
                {...form.register('limitAmount')}
              />
            </Field>
            <Field data-invalid={errors.limitUnit ? true : undefined}>
              <FieldLabel htmlFor="absence-type-limit-unit">{t('absenceTypes.form.limitUnit')}</FieldLabel>
              <Controller
                control={form.control}
                name="limitUnit"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={choose(limitUnitSchema, field.onChange)}>
                    <SelectTrigger id="absence-type-limit-unit" ref={field.ref} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {limitUnitSchema.options.map((item) => (
                        <SelectItem key={item} value={item}>
                          {t(`absenceTypes.units.${item}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field data-invalid={errors.limitPeriod ? true : undefined}>
              <FieldLabel htmlFor="absence-type-limit-period">{t('absenceTypes.form.limitPeriod')}</FieldLabel>
              <Controller
                control={form.control}
                name="limitPeriod"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={choose(limitPeriodSchema, field.onChange)}>
                    <SelectTrigger id="absence-type-limit-period" ref={field.ref} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {limitPeriodSchema.options.map((item) => (
                        <SelectItem key={item} value={item}>
                          {t(`absenceTypes.limit.periods.${item}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>
          <FieldDescription id="absence-type-limit-hint">{t('absenceTypes.form.limitHint')}</FieldDescription>
          <FieldError id="absence-type-limit-error">{errors.limitAmount?.message ?? errors.limitUnit?.message ?? errors.limitPeriod?.message}</FieldError>
        </FieldSet>
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {absenceType === null ? t('absenceTypes.form.submitCreate') : t('absenceTypes.form.submitEdit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Nuovo tipo (dalla lista) o modifica di un tipo esistente, con tutti i campi di spec §3.1. */
const AbsenceTypeFormDialog = ({ open, absenceType, onClose }: AbsenceTypeFormDialogProps) => {
  const { t } = useTranslation()
  // Titolo conservato durante l'animazione di chiusura
  const [last, setLast] = useState<{ type: AbsenceType | null }>({ type: absenceType })
  if (open && absenceType !== last.type) setLast({ type: absenceType })
  const shown = open ? absenceType : last.type
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
          // Il menu di riga non c'è più: il focus torna al suo pulsante, o a "Nuovo tipo" dopo una creazione
          event.preventDefault()
          focusTrigger(ABSENCE_TYPE_TRIGGER_ATTRIBUTE, shown?.id ?? NEW_ABSENCE_TYPE_TRIGGER)
        }}
      >
        <DialogHeader>
          <DialogTitle>{shown === null ? t('absenceTypes.form.createTitle') : t('absenceTypes.form.editTitle', { name: shown.name })}</DialogTitle>
          <DialogDescription>{shown === null ? t('absenceTypes.form.createDescription') : t('absenceTypes.form.editDescription')}</DialogDescription>
        </DialogHeader>
        {open && <AbsenceTypeForm key={openCount} absenceType={absenceType} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  )
}

export default AbsenceTypeFormDialog
