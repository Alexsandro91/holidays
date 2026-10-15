import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import PasswordInput from '@/components/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EMPLOYMENT_TYPES, isEmploymentType, useMultipleLocations } from '@/features/auth/api'
import { emailField } from '@/features/auth/validation'
import { useLocationOptions } from '@/features/locations/api'
import { useUpdateUser, type ManagedUser } from '@/features/users/api'
import { isApiError } from '@/lib/api'
import { focusTrigger, USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

// La password di chi agisce serve solo per modificare un altro admin (fix di sicurezza sul backend)
// L'email si valida solo se si può cambiare: un indirizzo storico in sola lettura non blocca il salvataggio del nome
const createSchema = (t: TFunction, askPassword: boolean, emailEditable: boolean) =>
  z.object({
    firstName: z.string().trim().min(1, t('validation.firstNameRequired')),
    lastName: z.string().trim().min(1, t('validation.lastNameRequired')),
    email: emailEditable ? emailField(t) : z.string(),
    employmentType: z.enum(['employee', 'contractor', 'intern']),
    // Id della sede come testo (valore della select)
    locationId: z.string(),
    currentPassword: askPassword ? z.string().min(1, t('validation.passwordRequired')) : z.string(),
  })

type EditValues = z.infer<ReturnType<typeof createSchema>>

const FIELDS: (keyof EditValues)[] = ['firstName', 'lastName', 'email', 'employmentType', 'locationId', 'currentPassword']

interface EditUserDialogProps {
  user: ManagedUser | null
  onClose: () => void
  /** Attributo dei pulsanti che aprono il dialog: alla chiusura il focus torna lì (vedi lib/focusTrigger) */
  triggerAttribute?: string
  /** Valore dell'attributo del pulsante d'origine; di default l'id dell'utente */
  triggerKey?: (user: ManagedUser) => string | number
}

interface EditFormProps {
  user: ManagedUser
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

/** Il form si monta a ogni apertura: parte dai dati attuali, senza errori. */
const EditForm = ({ user, onClose, onBusyChange }: EditFormProps) => {
  const { t } = useTranslation()
  const update = useUpdateUser()
  // L'email si cambia solo finché l'invito non è accettato (spec §7.3): per gli altri è l'indirizzo di accesso
  const emailEditable = user.status === 'invited'
  // Modificare un altro admin chiede la password di chi agisce, come promozione e revoca
  const askPassword = user.role === 'admin' && !user.is_current_user
  const multipleLocations = useMultipleLocations()
  // Solo l'admin cambia la sede (can.change_location) e solo se ce n'è più d'una (spec SP2 fase 1 §5.4 e §5.5)
  const showLocation = user.can.change_location && multipleLocations
  const locations = useLocationOptions(showLocation)
  // Uno stagista può essere solo Utente: per un responsabile o un admin il tipo Stagista non si sceglie (spec §7.3)
  const internAllowed = user.role === 'employee'
  const schema = useMemo(() => createSchema(t, askPassword, emailEditable), [t, askPassword, emailEditable])
  // La password vive solo nel form: si smonta alla chiusura e la mutation ha gcTime 0
  const form = useForm<EditValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      employmentType: user.employment_type,
      locationId: String(user.location.id),
      currentPassword: '',
    },
  })
  const { errors } = form.formState
  // Messaggio del server mostrato nel dialog (troppe richieste, errori senza campo)
  const [notice, setNotice] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  // Evita il doppio invio: letto solo nei gestori di evento. Dopo il salvataggio resta attivo fino allo smontaggio:
  // durante l'animazione di chiusura il form è ancora nel DOM
  const submitting = useRef(false)

  const submit = async ({ firstName, lastName, email, employmentType, locationId, currentPassword }: EditValues) => {
    if (submitting.current) return
    submitting.current = true
    setNotice(null)
    onBusyChange(true)
    let updated: ManagedUser
    try {
      updated = (await update.mutateAsync({
        id: user.id,
        firstName,
        lastName,
        email: emailEditable ? email : undefined,
        // Tipo e sede solo se cambiano: la richiesta non aggiunge tappe inutili allo storico
        employmentType: employmentType !== user.employment_type ? employmentType : undefined,
        locationId: showLocation && Number(locationId) !== user.location.id ? Number(locationId) : undefined,
        currentPassword: askPassword ? currentPassword : undefined,
      })).data
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const messages: Record<keyof EditValues, string | undefined> = {
          firstName: error.fieldErrors.first_name?.[0],
          lastName: error.fieldErrors.last_name?.[0],
          email: error.fieldErrors.email?.[0],
          employmentType: error.fieldErrors.employment_type?.[0],
          locationId: error.fieldErrors.location_id?.[0],
          currentPassword: error.fieldErrors.current_password?.[0],
        }
        FIELDS.forEach((field) => {
          const message = messages[field]
          if (message) form.setError(field, { message })
        })
        // Il focus va al primo campo con errore, nell'ordine in cui compaiono
        const first = FIELDS.find((field) => messages[field] !== undefined)
        if (first) form.setFocus(first)
        else setNotice(error.message)
      } else if (isApiError(error, 'throttled')) {
        setNotice(error.message)
        setLocked(true)
      } else if (isApiError(error) && (error.status === 403 || error.status === 409)) {
        // 403 e 409 (es. users.state_changed): non si può più fare, il dialog si chiude e la lista si ricarica
        // (invalidazione in useAdminMutation). Il messaggio del server è già tradotto
        toast.error(error.message)
        onClose()
      } else {
        // Rete o errore del server: il dialog resta aperto con i dati scritti, si può riprovare
        toast.error(isApiError(error, 'network') ? t('errors.network') : t('errors.generic'))
      }
      return
    } finally {
      onBusyChange(false)
    }
    // Esito secondo il server: per lui l'email cambia solo dopo la normalizzazione (es. maiuscole), e solo allora rimanda l'invito
    const emailChanged = updated.email !== user.email
    toast.success(emailChanged ? t('users.editDialog.reinvited', { email: updated.email }) : t('users.editDialog.done', { name: updated.name }))
    onClose()
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Bloccato (invio in corso o 429): l'Invio non fa nulla, nemmeno la validazione
    if (submitting.current || locked) {
      event.preventDefault()
      return
    }
    return form.handleSubmit(submit)(event)
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={errors.firstName ? true : undefined}>
            <FieldLabel htmlFor="edit-first-name">{t('users.editDialog.firstName')}</FieldLabel>
            <Input
              id="edit-first-name"
              autoComplete="off"
              aria-invalid={errors.firstName ? true : undefined}
              aria-describedby={errors.firstName ? 'edit-first-name-error' : undefined}
              {...form.register('firstName')}
            />
            <FieldError id="edit-first-name-error">{errors.firstName?.message}</FieldError>
          </Field>
          <Field data-invalid={errors.lastName ? true : undefined}>
            <FieldLabel htmlFor="edit-last-name">{t('users.editDialog.lastName')}</FieldLabel>
            <Input
              id="edit-last-name"
              autoComplete="off"
              aria-invalid={errors.lastName ? true : undefined}
              aria-describedby={errors.lastName ? 'edit-last-name-error' : undefined}
              {...form.register('lastName')}
            />
            <FieldError id="edit-last-name-error">{errors.lastName?.message}</FieldError>
          </Field>
        </div>
        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="edit-email">{t('users.editDialog.email')}</FieldLabel>
          <Input
            id="edit-email"
            type="email"
            autoComplete="off"
            // In sola lettura, non disabilitata: resta leggibile e raggiungibile da tastiera, con la spiegazione
            readOnly={!emailEditable}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'edit-email-error edit-email-hint' : 'edit-email-hint'}
            className={emailEditable ? undefined : 'bg-muted text-muted-foreground'}
            {...form.register('email')}
          />
          <FieldDescription id="edit-email-hint">{emailEditable ? t('users.editDialog.emailInvited') : t('users.editDialog.emailLocked')}</FieldDescription>
          <FieldError id="edit-email-error">{errors.email?.message}</FieldError>
        </Field>
        <FieldSet>
          <FieldLegend variant="label">{t('users.editDialog.employmentType')}</FieldLegend>
          <Controller
            control={form.control}
            name="employmentType"
            render={({ field }) => (
              <RadioGroup
                value={field.value}
                onValueChange={(value) => isEmploymentType(value) && field.onChange(value)}
                onBlur={field.onBlur}
                ref={field.ref}
                aria-invalid={errors.employmentType ? true : undefined}
                aria-describedby={[internAllowed ? '' : 'edit-employment-type-note', errors.employmentType ? 'edit-employment-type-error' : ''].filter(Boolean).join(' ') || undefined}
              >
                {EMPLOYMENT_TYPES.map((type) => (
                  <Field key={type} orientation="horizontal" data-disabled={type === 'intern' && !internAllowed ? true : undefined}>
                    <RadioGroupItem value={type} id={`edit-employment-type-${type}`} disabled={type === 'intern' && !internAllowed} />
                    <FieldLabel htmlFor={`edit-employment-type-${type}`}>{t(`users.employmentTypes.${type}`)}</FieldLabel>
                  </Field>
                ))}
              </RadioGroup>
            )}
          />
          {!internAllowed && <FieldDescription id="edit-employment-type-note">{t('users.internNeedsUserRole')}</FieldDescription>}
          <FieldError id="edit-employment-type-error">{errors.employmentType?.message}</FieldError>
        </FieldSet>
        {showLocation && (
          <Field data-invalid={errors.locationId ? true : undefined}>
            <Label id="edit-location-label" htmlFor="edit-location">
              {t('users.editDialog.location')}
            </Label>
            <Controller
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id="edit-location"
                    aria-labelledby="edit-location-label"
                    aria-describedby={errors.locationId ? 'edit-location-note edit-location-error' : 'edit-location-note'}
                    aria-invalid={errors.locationId ? true : undefined}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {/* La sede attuale c'è sempre, anche prima che arrivino le opzioni */}
                    {(locations.data ?? [{ id: user.location.id, name: user.location.name, is_primary: false }]).map((location) => (
                      <SelectItem key={location.id} value={String(location.id)}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldDescription id="edit-location-note">{t('users.editDialog.locationNote')}</FieldDescription>
            <FieldError id="edit-location-error">{errors.locationId?.message}</FieldError>
          </Field>
        )}
        {askPassword && (
          <Field data-invalid={errors.currentPassword ? true : undefined}>
            <FieldLabel htmlFor="edit-password">{t('users.editDialog.password')}</FieldLabel>
            <PasswordInput
              id="edit-password"
              autoComplete="current-password"
              aria-invalid={errors.currentPassword ? true : undefined}
              aria-describedby={errors.currentPassword ? 'edit-password-error' : undefined}
              {...form.register('currentPassword')}
            />
            <FieldError id="edit-password-error">{errors.currentPassword?.message}</FieldError>
          </Field>
        )}
        {notice && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
      <DialogFooter className="mt-4">
        {/* aria-disabled: dopo un 429 il pulsante resta focalizzabile (il blocco è nel gestore dell'invio) */}
        <Button type="submit" aria-disabled={update.isPending || locked || undefined}>
          {update.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('users.editDialog.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/** Modifica di nome, cognome, email (solo invitati), tipo di rapporto e, per l'admin, sede. */
const EditUserDialog = ({ user, onClose, triggerAttribute = USER_TRIGGER_ATTRIBUTE, triggerKey = (target) => target.id }: EditUserDialogProps) => {
  const { t } = useTranslation()
  const open = user !== null
  // Contenuto conservato durante l'animazione di chiusura
  const [last, setLast] = useState<ManagedUser | null>(user)
  if (user !== null && user !== last) setLast(user)
  const shown = user ?? last
  // Conta le aperture: ogni apertura rimonta il form (anche se avviene durante l'animazione di chiusura)
  const [openCount, setOpenCount] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount(openCount + 1)
  }
  // Durante l'invio il dialog non si chiude (Escape, clic fuori): un errore non va perso
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(triggerAttribute, shown ? triggerKey(shown) : null)
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('users.editDialog.title', { name: shown?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('users.editDialog.description')}</DialogDescription>
        </DialogHeader>
        {shown && <EditForm key={`${openCount}-${shown.id}`} user={shown} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  )
}

export default EditUserDialog
