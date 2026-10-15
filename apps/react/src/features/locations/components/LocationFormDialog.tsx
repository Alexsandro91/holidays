import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useCreateLocation, useUpdateLocation, type Location } from '@/features/locations/api'
import { formatPatron, parsePatron } from '@/features/locations/patron'
import { isApiError } from '@/lib/api'

const MAX_LENGTH = 100

const createSchema = (t: TFunction) =>
  z.object({
    name: z.string().trim().min(1, t('validation.locationNameRequired')).max(MAX_LENGTH, t('validation.tooLong', { max: MAX_LENGTH })),
    city: z.string().trim().max(MAX_LENGTH, t('validation.tooLong', { max: MAX_LENGTH })),
    patron: z.string().refine((value) => parsePatron(value) !== 'invalid', t('validation.patronInvalid')),
  })

type LocationValues = z.infer<ReturnType<typeof createSchema>>

const FIELDS: (keyof LocationValues)[] = ['name', 'city', 'patron']

interface LocationFormDialogProps {
  open: boolean
  /** null = nuova sede */
  location: Location | null
  onClose: () => void
}

interface LocationFormProps {
  location: Location | null
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

/** Il form si monta a ogni apertura: parte dai dati attuali (o vuoto), senza errori. */
const LocationForm = ({ location, onClose, onBusyChange }: LocationFormProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateLocation()
  const update = useUpdateLocation(location?.id ?? 0)
  const pending = create.isPending || update.isPending
  const schema = useMemo(() => createSchema(t), [t])
  const form = useForm<LocationValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: location?.name ?? '',
      city: location?.city ?? '',
      patron: location ? formatPatron(location.patron_day, location.patron_month) : '',
    },
  })
  const { errors } = form.formState
  // Evita il doppio invio: letto solo nei gestori di evento
  const submitting = useRef(false)

  const submit = async ({ name, city, patron }: LocationValues) => {
    if (submitting.current) return
    submitting.current = true
    onBusyChange(true)
    const parsed = parsePatron(patron)
    const input = { name, city, patronDay: parsed === null || parsed === 'invalid' ? null : parsed.day, patronMonth: parsed === null || parsed === 'invalid' ? null : parsed.month }
    try {
      const { data } = location === null ? await create.mutateAsync(input) : await update.mutateAsync(input)
      toast.success(location === null ? t('locations.form.created', { name: data.name }) : t('locations.form.updated', { name: data.name }))
      onClose()
      // Nuova sede: si apre il dettaglio, dove si controllano orario e chiusure
      if (location === null) void navigate(`/admin/locations/${data.id}`)
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const messages: Record<keyof LocationValues, string | undefined> = {
          name: error.fieldErrors.name?.[0],
          city: error.fieldErrors.city?.[0],
          patron: error.fieldErrors.patron_day?.[0] ?? error.fieldErrors.patron_month?.[0],
        }
        FIELDS.forEach((field) => {
          const message = messages[field]
          if (message) form.setError(field, { message })
        })
        const first = FIELDS.find((field) => messages[field] !== undefined)
        if (first) form.setFocus(first)
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
          <FieldLabel htmlFor="location-name">{t('locations.form.name')}</FieldLabel>
          <Input
            id="location-name"
            autoComplete="off"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'location-name-error' : undefined}
            {...form.register('name')}
          />
          <FieldError id="location-name-error">{errors.name?.message}</FieldError>
        </Field>
        <Field data-invalid={errors.city ? true : undefined}>
          <FieldLabel htmlFor="location-city">{t('locations.form.city')}</FieldLabel>
          <Input
            id="location-city"
            autoComplete="off"
            aria-invalid={errors.city ? true : undefined}
            aria-describedby={errors.city ? 'location-city-hint location-city-error' : 'location-city-hint'}
            {...form.register('city')}
          />
          <FieldDescription id="location-city-hint">{t('locations.form.cityHint')}</FieldDescription>
          <FieldError id="location-city-error">{errors.city?.message}</FieldError>
        </Field>
        <Field data-invalid={errors.patron ? true : undefined}>
          <FieldLabel htmlFor="location-patron">{t('locations.form.patron')}</FieldLabel>
          <Input
            id="location-patron"
            inputMode="numeric"
            autoComplete="off"
            placeholder="07/12"
            className="max-w-32"
            aria-invalid={errors.patron ? true : undefined}
            aria-describedby={errors.patron ? 'location-patron-hint location-patron-error' : 'location-patron-hint'}
            {...form.register('patron')}
          />
          <FieldDescription id="location-patron-hint">{t('locations.form.patronHint')}</FieldDescription>
          <FieldError id="location-patron-error">{errors.patron?.message}</FieldError>
        </Field>
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {location === null ? t('locations.form.submitCreate') : t('locations.form.submitEdit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Nuova sede (dalla lista) o modifica di nome, città e patrono (dal dettaglio). */
const LocationFormDialog = ({ open, location, onClose }: LocationFormDialogProps) => {
  const { t } = useTranslation()
  // Titolo conservato durante l'animazione di chiusura
  const [last, setLast] = useState<Location | null>(location)
  if (location !== null && location !== last) setLast(location)
  const shown = open ? location : last
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{shown === null ? t('locations.form.createTitle') : t('locations.form.editTitle', { name: shown.name })}</DialogTitle>
          <DialogDescription>{shown === null ? t('locations.form.createDescription') : t('locations.form.editDescription')}</DialogDescription>
        </DialogHeader>
        {open && <LocationForm key={openCount} location={location} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  )
}

export default LocationFormDialog
