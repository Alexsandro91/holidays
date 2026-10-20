import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle } from 'lucide-react'
import { useMemo, type FormEvent } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { BALANCE_TYPES, type Accrual, type AccrualValuesInput, type BalanceType } from '@/features/balances/api'
import { formatHours, parseHours } from '@/features/balances/hoursFormat'

/** Valori annui in minuti: null = come il livello sopra (solo sede e persona). */
export type AccrualValues = AccrualValuesInput
/** Valori che valgono per chi eredita: quelli del livello sopra. */
export type EffectiveAccrual = Accrual['effective']

const MAX_MINUTES = 60000
const FIELD_KEYS: Record<BalanceType, keyof AccrualValues> = { vacation: 'vacation_minutes', rol: 'rol_minutes', ex_holidays: 'ex_holidays_minutes' }
const modeSchema = z.enum(['inherit', 'own'])
const choiceSchema = z.object({ mode: modeSchema, hours: z.string() })

const createSchema = (t: TFunction) =>
  z
    .object({ vacation: choiceSchema, rol: choiceSchema, ex_holidays: choiceSchema })
    .superRefine((values, context) => {
      BALANCE_TYPES.forEach((balance) => {
        const { mode, hours } = values[balance]
        if (mode === 'inherit') return
        const minutes = parseHours(hours)
        if (minutes === null || minutes < 0) context.addIssue({ code: 'custom', path: [balance, 'hours'], message: t('accrual.validation.number') })
        else if (minutes > MAX_MINUTES) context.addIssue({ code: 'custom', path: [balance, 'hours'], message: t('accrual.validation.max', { max: MAX_MINUTES / 60 }) })
      })
    })

type FormValues = z.infer<ReturnType<typeof createSchema>>

/** Minuti di un saldo se il testo è un valore valido (0..1000 h), altrimenti null. */
const validMinutes = (hours: string): number | null => {
  const minutes = parseHours(hours)
  return minutes !== null && minutes >= 0 && minutes <= MAX_MINUTES ? minutes : null
}

interface AccrualValuesFormProps {
  /** Valori impostati a questo livello (null = eredita) */
  values: AccrualValues
  /** Valori che valgono se il livello eredita, cioè quelli del livello sopra */
  effective: EffectiveAccrual
  /** false per l'azienda: nessuna ereditarietà, sempre un valore */
  inheritable: boolean
  /** Da cui eredita chi può ereditare: l'azienda (sede) o la sede (persona) */
  inheritFrom?: 'company' | 'location'
  onSubmit: (values: AccrualValues) => void
  pending: boolean
}

const choose =
  <T,>(schema: z.ZodType<T>, onChange: (value: T) => void) =>
  (value: string) => {
    const parsed = schema.safeParse(value)
    if (parsed.success) onChange(parsed.data)
  }

/** Tre valori annui in ore per un tempo pieno, con la quota mensile; sede e persona possono ereditare dal livello sopra. */
const AccrualValuesForm = ({ values, effective, inheritable, inheritFrom = 'company', onSubmit, pending }: AccrualValuesFormProps) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const schema = useMemo(() => createSchema(t), [t])
  const initial = (balance: BalanceType): FormValues[BalanceType] => {
    const own = values[FIELD_KEYS[balance]]
    return own === null ? { mode: 'inherit', hours: '' } : { mode: 'own', hours: formatHours(own, locale) }
  }
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { vacation: initial('vacation'), rol: initial('rol'), ex_holidays: initial('ex_holidays') },
  })
  const { errors } = form.formState
  const watched = useWatch({ control: form.control })

  const submit = (formValues: FormValues) => {
    const result: AccrualValues = { vacation_minutes: null, rol_minutes: null, ex_holidays_minutes: null }
    BALANCE_TYPES.forEach((balance) => {
      const { mode, hours } = formValues[balance]
      result[FIELD_KEYS[balance]] = mode === 'inherit' ? null : validMinutes(hours)
    })
    onSubmit(result)
  }

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(submit)(event)

  return (
    <form onSubmit={onFormSubmit} noValidate>
      <FieldGroup>
        {BALANCE_TYPES.map((balance) => {
          const name = t(`accrual.balances.${balance}`)
          const mode = inheritable ? (watched[balance]?.mode ?? 'inherit') : 'own'
          const annual = mode === 'own' ? validMinutes(watched[balance]?.hours ?? '') : effective[balance].minutes
          const error = errors[balance]?.hours?.message
          const inputId = `accrual-${balance}`
          const describedBy = [annual === null ? null : `${inputId}-monthly`, error ? `${inputId}-error` : null].filter((id) => id !== null).join(' ')
          const monthly = annual === null ? null : t('accrual.monthly', { hours: formatHours(Math.round(annual / 12), locale) })

          const input = (
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={inputId}>{inheritable ? t('accrual.annualHours', { balance: name }) : name}</FieldLabel>
              <Input
                id={inputId}
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={error ? true : undefined}
                aria-describedby={describedBy === '' ? undefined : describedBy}
                {...form.register(`${balance}.hours`)}
              />
              {inheritable ? null : <FieldDescription>{t('accrual.hoursHint')}</FieldDescription>}
              <FieldError id={`${inputId}-error`}>{error}</FieldError>
            </Field>
          )

          return (
            <FieldSet key={balance}>
              {inheritable ? (
                <>
                  <FieldLegend variant="label">{name}</FieldLegend>
                  <Controller
                    control={form.control}
                    name={`${balance}.mode`}
                    render={({ field }) => (
                      <RadioGroup value={field.value} onValueChange={choose(modeSchema, field.onChange)} aria-label={name}>
                        <Field orientation="horizontal">
                          <RadioGroupItem id={`${inputId}-inherit`} value="inherit" ref={field.ref} />
                          <FieldLabel htmlFor={`${inputId}-inherit`} className="font-normal">
                            {t(inheritFrom === 'company' ? 'accrual.inheritCompany' : 'accrual.inheritLocation', { hours: formatHours(effective[balance].minutes, locale) })}
                          </FieldLabel>
                        </Field>
                        <Field orientation="horizontal">
                          <RadioGroupItem id={`${inputId}-own`} value="own" />
                          <FieldLabel htmlFor={`${inputId}-own`} className="font-normal">
                            {t(inheritFrom === 'company' ? 'accrual.ownLocation' : 'accrual.ownPerson')}
                          </FieldLabel>
                        </Field>
                      </RadioGroup>
                    )}
                  />
                  {mode === 'own' && input}
                </>
              ) : (
                input
              )}
              {monthly !== null && (
                <p id={`${inputId}-monthly`} className="text-sm text-muted-foreground">
                  {monthly}
                </p>
              )}
            </FieldSet>
          )
        })}
      </FieldGroup>
      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('accrual.save')}
        </Button>
      </div>
    </form>
  )
}

export default AccrualValuesForm
