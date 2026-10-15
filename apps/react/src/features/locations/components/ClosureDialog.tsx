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
import { useCreateClosure, useUpdateClosure, type Closure } from '@/features/locations/api'
import { daysInclusive } from '@/features/locations/dateFormat'
import { isApiError } from '@/lib/api'
import { focusTrigger, LOCATION_DETAIL_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

const MAX_DAYS = 31
const MAX_DESCRIPTION = 100

const createSchema = (t: TFunction) =>
  z
    .object({
      scope: z.enum(['location', 'all']),
      startsOn: z.string().min(1, t('closures.dateRequired')),
      endsOn: z.string().min(1, t('closures.dateRequired')),
      description: z.string().trim().min(1, t('closures.descriptionRequired')).max(MAX_DESCRIPTION, t('validation.tooLong', { max: MAX_DESCRIPTION })),
    })
    .superRefine(({ startsOn, endsOn }, context) => {
      if (startsOn === '' || endsOn === '') return
      if (endsOn < startsOn) context.addIssue({ code: 'custom', path: ['endsOn'], message: t('closures.endsBeforeStart') })
      else if (daysInclusive(startsOn, endsOn) > MAX_DAYS) context.addIssue({ code: 'custom', path: ['endsOn'], message: t('closures.tooLong') })
    })

type ClosureValues = z.infer<ReturnType<typeof createSchema>>

const FIELDS: (keyof ClosureValues)[] = ['scope', 'startsOn', 'endsOn', 'description']

const isScope = (value: string): value is ClosureValues['scope'] => value === 'location' || value === 'all'

interface ClosureDialogProps {
  open: boolean
  locationId: number
  /** null = nuova chiusura */
  closure: Closure | null
  onClose: () => void
}

interface ClosureFormProps {
  locationId: number
  closure: Closure | null
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

const ClosureForm = ({ locationId, closure, onClose, onBusyChange }: ClosureFormProps) => {
  const { t } = useTranslation()
  const create = useCreateClosure()
  const update = useUpdateClosure()
  const pending = create.isPending || update.isPending
  const schema = useMemo(() => createSchema(t), [t])
  const form = useForm<ClosureValues>({
    resolver: zodResolver(schema),
    defaultValues: closure
      ? { scope: closure.location_id === null ? 'all' : 'location', startsOn: closure.starts_on, endsOn: closure.ends_on, description: closure.description }
      : { scope: 'location', startsOn: '', endsOn: '', description: '' },
  })
  const { errors } = form.formState
  const submitting = useRef(false)

  const submit = async ({ scope, startsOn, endsOn, description }: ClosureValues) => {
    if (submitting.current) return
    submitting.current = true
    onBusyChange(true)
    const input = { locationId: scope === 'all' ? null : locationId, startsOn, endsOn, description }
    try {
      if (closure === null) await create.mutateAsync(input)
      else await update.mutateAsync({ id: closure.id, ...input })
      toast.success(closure === null ? t('closures.dialog.created') : t('closures.dialog.updated'))
      onClose()
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const messages: Record<keyof ClosureValues, string | undefined> = {
          scope: error.fieldErrors.location_id?.[0],
          startsOn: error.fieldErrors.starts_on?.[0],
          endsOn: error.fieldErrors.ends_on?.[0],
          description: error.fieldErrors.description?.[0],
        }
        FIELDS.forEach((field) => {
          const message = messages[field]
          if (message) form.setError(field, { message })
        })
        if (!FIELDS.some((field) => messages[field] !== undefined)) toast.error(error.message)
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
        <FieldSet>
          <FieldLegend variant="label">{t('closures.dialog.scope')}</FieldLegend>
          <Controller
            control={form.control}
            name="scope"
            render={({ field }) => (
              <RadioGroup value={field.value} onValueChange={(value) => isScope(value) && field.onChange(value)} onBlur={field.onBlur} ref={field.ref}>
                {(['location', 'all'] satisfies ClosureValues['scope'][]).map((scope) => (
                  <Field key={scope} orientation="horizontal">
                    <RadioGroupItem value={scope} id={`closure-scope-${scope}`} />
                    <FieldLabel htmlFor={`closure-scope-${scope}`}>{scope === 'all' ? t('closures.dialog.scopeAll') : t('closures.dialog.scopeLocation')}</FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            )}
          />
          <FieldError>{errors.scope?.message}</FieldError>
        </FieldSet>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={errors.startsOn ? true : undefined}>
            <FieldLabel htmlFor="closure-starts-on">{t('closures.dialog.startsOn')}</FieldLabel>
            <Input
              id="closure-starts-on"
              type="date"
              aria-invalid={errors.startsOn ? true : undefined}
              aria-describedby={errors.startsOn ? 'closure-starts-on-error' : undefined}
              {...form.register('startsOn')}
            />
            <FieldError id="closure-starts-on-error">{errors.startsOn?.message}</FieldError>
          </Field>
          <Field data-invalid={errors.endsOn ? true : undefined}>
            <FieldLabel htmlFor="closure-ends-on">{t('closures.dialog.endsOn')}</FieldLabel>
            <Input
              id="closure-ends-on"
              type="date"
              aria-invalid={errors.endsOn ? true : undefined}
              aria-describedby={errors.endsOn ? 'closure-ends-on-error' : undefined}
              {...form.register('endsOn')}
            />
            <FieldError id="closure-ends-on-error">{errors.endsOn?.message}</FieldError>
          </Field>
        </div>
        <Field data-invalid={errors.description ? true : undefined}>
          <FieldLabel htmlFor="closure-description">{t('closures.dialog.text')}</FieldLabel>
          <Input
            id="closure-description"
            autoComplete="off"
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={errors.description ? 'closure-description-hint closure-description-error' : 'closure-description-hint'}
            {...form.register('description')}
          />
          <FieldDescription id="closure-description-hint">{t('closures.dialog.textHint')}</FieldDescription>
          <FieldError id="closure-description-error">{errors.description?.message}</FieldError>
        </Field>
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('closures.dialog.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Nuova chiusura o modifica: solo questa sede o tutte, al massimo 31 giorni (spec §2.4). */
const ClosureDialog = ({ open, locationId, closure, onClose }: ClosureDialogProps) => {
  const { t } = useTranslation()
  const [last, setLast] = useState<Closure | null>(closure)
  if (closure !== null && closure !== last) setLast(closure)
  const shown = open ? closure : last
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
          focusTrigger(LOCATION_DETAIL_TRIGGER_ATTRIBUTE, shown ? `closure-edit-${shown.id}` : 'add-closure')
        }}
      >
        <DialogHeader>
          <DialogTitle>{shown === null ? t('closures.dialog.createTitle') : t('closures.dialog.editTitle')}</DialogTitle>
          <DialogDescription>{t('closures.dialog.description')}</DialogDescription>
        </DialogHeader>
        {open && <ClosureForm key={openCount} locationId={locationId} closure={closure} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  )
}

export default ClosureDialog
