import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle } from 'lucide-react'
import { useMemo } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { balanceTypeSchema, useAdjustBalance, type BalanceSummary } from '@/features/balances/api'
import { formatHours, parseHours } from '@/features/balances/hoursFormat'
import { isApiError } from '@/lib/api'

interface AdjustBalanceDialogProps {
  userId: number
  userName: string
  /** Saldi della persona: scelta del saldo e anteprima del risultato */
  summary: BalanceSummary
  open: boolean
  onClose: () => void
}

const MAX_MINUTES = 600000
const directionSchema = z.enum(['add', 'remove'])

const createSchema = (t: TFunction) =>
  z.object({
    balance: balanceTypeSchema,
    direction: directionSchema,
    hours: z.string().superRefine((text, context) => {
      const minutes = parseHours(text)
      if (minutes === null || minutes <= 0) context.addIssue({ code: 'custom', message: t('balances.adjust.validation.hours') })
      else if (minutes > MAX_MINUTES) context.addIssue({ code: 'custom', message: t('balances.adjust.validation.max', { max: MAX_MINUTES / 60 }) })
    }),
    note: z.string().trim().min(1, t('balances.adjust.validation.note')).max(255),
  })

type FormValues = z.infer<ReturnType<typeof createSchema>>

interface FormProps {
  userId: number
  summary: BalanceSummary
  onClose: () => void
}

const choose =
  <T,>(schema: z.ZodType<T>, onChange: (value: T) => void) =>
  (value: string) => {
    const parsed = schema.safeParse(value)
    if (parsed.success) onChange(parsed.data)
  }

const AdjustForm = ({ userId, summary, onClose }: FormProps) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const adjust = useAdjustBalance(userId)
  const schema = useMemo(() => createSchema(t), [t])
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { balance: 'vacation', direction: 'add', hours: '', note: '' } })
  const { errors } = form.formState
  const watched = useWatch({ control: form.control })

  const current = summary.balances.find((item) => item.balance === watched.balance)
  const typed = parseHours(watched.hours ?? '')
  const signed = typed === null || typed <= 0 ? null : watched.direction === 'remove' ? -typed : typed
  const preview = current !== undefined && signed !== null ? t('balances.adjust.preview', { balance: current.label, hours: formatHours(current.current_minutes + signed, locale) }) : null

  const submit = async (values: FormValues) => {
    const minutes = parseHours(values.hours)
    if (minutes === null) return
    try {
      const name = summary.balances.find((item) => item.balance === values.balance)?.label ?? ''
      await adjust.mutateAsync({ balance: values.balance, minutes: values.direction === 'remove' ? -minutes : minutes, note: values.note.trim() })
      const after = (summary.balances.find((item) => item.balance === values.balance)?.current_minutes ?? 0) + (values.direction === 'remove' ? -minutes : minutes)
      toast.success(t('balances.adjust.done', { balance: name, hours: formatHours(after, locale) }))
      onClose()
    } catch (error) {
      const fields = isApiError(error) ? error.fieldErrors : {}
      const hours = fields.minutes?.[0]
      const note = fields.note?.[0]
      if (hours !== undefined) form.setError('hours', { type: 'server', message: hours })
      if (note !== undefined) form.setError('note', { type: 'server', message: note })
      if (hours === undefined && note === undefined) toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    }
  }

  const hoursError = errors.hours?.message
  const noteError = errors.note?.message

  return (
    <form onSubmit={(event) => void form.handleSubmit(submit)(event)} noValidate>
      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">{t('balances.adjust.balance')}</FieldLegend>
          <Controller
            control={form.control}
            name="balance"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={choose(balanceTypeSchema, field.onChange)} aria-label={t('balances.adjust.balance')}>
                {summary.balances.map((item) => (
                  <Field key={item.balance} orientation="horizontal">
                    <RadioGroupItem id={`adjust-balance-${item.balance}`} value={item.balance} />
                    <FieldLabel htmlFor={`adjust-balance-${item.balance}`} className="font-normal">
                      {item.label}
                    </FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            )}
          />
        </FieldSet>
        <FieldSet>
          <FieldLegend variant="label">{t('balances.adjust.direction')}</FieldLegend>
          <Controller
            control={form.control}
            name="direction"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={choose(directionSchema, field.onChange)} aria-label={t('balances.adjust.direction')} className="flex gap-4">
                <Field orientation="horizontal">
                  <RadioGroupItem id="adjust-direction-add" value="add" />
                  <FieldLabel htmlFor="adjust-direction-add" className="font-normal">
                    {t('balances.adjust.add')}
                  </FieldLabel>
                </Field>
                <Field orientation="horizontal">
                  <RadioGroupItem id="adjust-direction-remove" value="remove" />
                  <FieldLabel htmlFor="adjust-direction-remove" className="font-normal">
                    {t('balances.adjust.remove')}
                  </FieldLabel>
                </Field>
              </RadioGroup>
            )}
          />
        </FieldSet>
        <Field data-invalid={hoursError ? true : undefined}>
          <FieldLabel htmlFor="adjust-hours">{t('balances.adjust.hours')}</FieldLabel>
          <Input
            id="adjust-hours"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={hoursError ? true : undefined}
            aria-describedby={hoursError ? 'adjust-hours-error' : 'adjust-hours-hint'}
            {...form.register('hours')}
          />
          <FieldDescription id="adjust-hours-hint">{t('balances.adjust.hoursHint')}</FieldDescription>
          <FieldError id="adjust-hours-error">{hoursError}</FieldError>
        </Field>
        <Field data-invalid={noteError ? true : undefined}>
          <FieldLabel htmlFor="adjust-note">{t('balances.adjust.note')}</FieldLabel>
          <Input id="adjust-note" maxLength={255} autoComplete="off" aria-invalid={noteError ? true : undefined} aria-describedby={noteError ? 'adjust-note-error' : undefined} {...form.register('note')} />
          <FieldError id="adjust-note-error">{noteError}</FieldError>
        </Field>
        {preview !== null && (
          <p className="text-sm font-medium" aria-live="polite">
            {preview}
          </p>
        )}
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="submit" disabled={adjust.isPending}>
          {adjust.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('balances.adjust.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Rettifica di un saldo: aggiungi o togli ore con un motivo obbligatorio (spec SP2 fase 2 §7.5). */
const AdjustBalanceDialog = ({ userId, userName, summary, open, onClose }: AdjustBalanceDialogProps) => {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('balances.adjust.title', { name: userName })}</DialogTitle>
          <DialogDescription>{t('balances.adjust.description')}</DialogDescription>
        </DialogHeader>
        <AdjustForm userId={userId} summary={summary} onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

export default AdjustBalanceDialog
