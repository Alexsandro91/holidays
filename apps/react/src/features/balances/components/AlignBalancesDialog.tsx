import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle } from 'lucide-react'
import { useMemo } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { BALANCE_TYPES, useAlignBalances, useBalancesAt, type BalanceType } from '@/features/balances/api'
import { formatNumericDate } from '@/features/balances/describeMovement'
import { formatHours, parseHours } from '@/features/balances/hoursFormat'
import { isApiError } from '@/lib/api'
import { focusTrigger, USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface AlignBalancesDialogProps {
  userId: number
  userName: string
  open: boolean
  onClose: () => void
  /** Persona il cui pulsante (USER_TRIGGER_ATTRIBUTE) riprende il focus alla chiusura: per i dialog aperti da un menu che non esiste più */
  returnFocusToUser?: number
}

const MAX_MINUTES = 600000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** Ultimo giorno del mese precedente a oggi (YYYY-MM-DD). */
const lastDayOfPreviousMonth = (): string => {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0)).toISOString().slice(0, 10)
}

const todayText = (): string => {
  const now = new Date()
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10)
}

const createSchema = (t: TFunction) => {
  const hours = z.string().superRefine((text, context) => {
    if (text.trim() === '') return
    const minutes = parseHours(text)
    if (minutes === null || Math.abs(minutes) > MAX_MINUTES) context.addIssue({ code: 'custom', message: t('balances.align.validation.number') })
  })
  return z.object({
    date: z.string().regex(DATE_PATTERN, t('balances.align.validation.date')),
    vacation: hours,
    rol: hours,
    ex_holidays: hours,
    note: z.string().max(255),
  })
}

type FormValues = z.infer<ReturnType<typeof createSchema>>

interface FormProps {
  userId: number
  onClose: () => void
}

const signedHours = (minutes: number, locale: string): string => {
  const text = formatHours(minutes, locale)
  return minutes > 0 ? `+${text}` : text
}

const AlignForm = ({ userId, onClose }: FormProps) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const align = useAlignBalances(userId)
  const schema = useMemo(() => createSchema(t), [t])
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: lastDayOfPreviousMonth(), vacation: '', rol: '', ex_holidays: '', note: '' },
  })
  const { errors } = form.formState
  const watched = useWatch({ control: form.control })
  const date = watched.date ?? ''
  const validDate = DATE_PATTERN.test(date) ? date : null
  const at = useBalancesAt(userId, validDate)
  // Il valore nell'app vale solo se è quello della data scritta ora
  const inApp = at.data !== undefined && at.data.date === validDate ? at.data.balances : null

  const submit = async (values: FormValues) => {
    const entered: Partial<Record<BalanceType, number>> = {}
    BALANCE_TYPES.forEach((balance) => {
      const minutes = values[balance].trim() === '' ? null : parseHours(values[balance])
      if (minutes !== null) entered[balance] = minutes
    })
    if (Object.keys(entered).length === 0) {
      form.setError('root.values', { type: 'validate', message: t('balances.align.validation.empty') })
      return
    }
    try {
      const result = await align.mutateAsync({ alignedOn: values.date, values: entered, note: values.note })
      // Il movimento registrato per ogni saldo indicato (0 = già allineato), non il totale di oggi
      const items = BALANCE_TYPES.filter((balance) => entered[balance] !== undefined).map((balance) => {
        const name = t(`accrual.balances.${balance}`)
        const delta = result.deltas[balance] ?? 0
        return delta === 0 ? t('balances.align.doneItemNone', { balance: name }) : t('balances.align.doneItem', { balance: name, hours: signedHours(delta, locale) })
      })
      toast.success(t('balances.align.done', { count: items.length, date: formatNumericDate(values.date, locale) }), {
        description: t('balances.align.doneDescription', { balances: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items) }),
      })
      onClose()
    } catch (error) {
      const fields = isApiError(error) ? error.fieldErrors : {}
      const dateError = fields.aligned_on?.[0]
      const valuesError = fields.values?.[0]
      if (dateError !== undefined) form.setError('date', { type: 'server', message: dateError })
      if (valuesError !== undefined) form.setError('root.values', { type: 'server', message: valuesError })
      if (dateError === undefined && valuesError === undefined) toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    }
  }

  const dateError = errors.date?.message
  const rootError = errors.root?.values?.message

  return (
    <form onSubmit={(event) => void form.handleSubmit(submit)(event)} noValidate>
      <FieldGroup>
        <Field data-invalid={dateError ? true : undefined}>
          <FieldLabel htmlFor="align-date">{t('balances.align.date')}</FieldLabel>
          <Input id="align-date" type="date" max={todayText()} aria-invalid={dateError ? true : undefined} aria-describedby={dateError ? 'align-date-error' : undefined} {...form.register('date')} />
          <FieldError id="align-date-error">{dateError}</FieldError>
        </Field>
        {BALANCE_TYPES.map((balance) => {
          const name = t(`accrual.balances.${balance}`)
          const id = `align-${balance}`
          const error = errors[balance]?.message
          const typed = (watched[balance] ?? '').trim() === '' ? null : parseHours(watched[balance] ?? '')
          const base = inApp?.[balance]
          const delta = typed !== null && base !== undefined ? typed - base : null
          const preview = delta === null ? null : delta === 0 ? t('balances.align.previewNone') : t('balances.align.preview', { hours: signedHours(delta, locale) })
          const describedBy = [validDate === null ? null : `${id}-app`, preview === null ? null : `${id}-preview`, error ? `${id}-error` : null].filter((item) => item !== null).join(' ')
          return (
            <Field key={balance} data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={id}>{t('balances.align.payslip', { balance: name })}</FieldLabel>
              <Input id={id} inputMode="decimal" autoComplete="off" aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...form.register(balance)} />
              <FieldDescription id={`${id}-app`}>
                {validDate === null
                  ? null
                  : at.isError
                    ? t('balances.align.inAppError')
                    : base !== undefined
                      ? t('balances.align.inApp', { date: formatNumericDate(validDate, locale), hours: formatHours(base, locale) })
                      : t('balances.align.inAppLoading')}
              </FieldDescription>
              {preview !== null && (
                <p id={`${id}-preview`} className="text-sm font-medium" aria-live="polite">
                  {preview}
                </p>
              )}
              <FieldError id={`${id}-error`}>{error}</FieldError>
            </Field>
          )
        })}
        <Field>
          <FieldLabel htmlFor="align-note">{t('balances.align.note')}</FieldLabel>
          <Input id="align-note" maxLength={255} autoComplete="off" {...form.register('note')} />
        </Field>
        {rootError && <p role="alert" className="text-sm text-destructive">{rootError}</p>}
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="submit" disabled={align.isPending}>
          {align.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('balances.align.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Allinea alla busta paga: per ogni saldo il valore nell'app a quella data e quello della busta (spec SP2 fase 2 §7.4). */
const AlignBalancesDialog = ({ userId, userName, open, onClose, returnFocusToUser }: AlignBalancesDialogProps) => {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          // Senza la prop vale il comportamento di Radix (dialog dentro la scheda saldi)
          if (returnFocusToUser === undefined) return
          event.preventDefault()
          focusTrigger(USER_TRIGGER_ATTRIBUTE, returnFocusToUser)
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('balances.align.title', { name: userName })}</DialogTitle>
          <DialogDescription>{t('balances.align.description')}</DialogDescription>
        </DialogHeader>
        <AlignForm userId={userId} onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

export default AlignBalancesDialog
