import { zodResolver } from '@hookform/resolvers/zod'
import type { TFunction } from 'i18next'
import { LoaderCircle } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'
import PasswordInput from '@/components/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { emailField } from '@/features/auth/validation'
import { useUpdateUser, type ManagedUser } from '@/features/users/api'
import { isApiError } from '@/lib/api'
import { focusTrigger, USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

// La password di chi agisce serve solo per modificare un altro admin (fix di sicurezza sul backend)
const createSchema = (t: TFunction, askPassword: boolean) =>
  z.object({
    firstName: z.string().trim().min(1, t('validation.firstNameRequired')),
    lastName: z.string().trim().min(1, t('validation.lastNameRequired')),
    email: emailField(t),
    currentPassword: askPassword ? z.string().min(1, t('validation.passwordRequired')) : z.string(),
  })

type EditValues = z.infer<ReturnType<typeof createSchema>>

const FIELDS: (keyof EditValues)[] = ['firstName', 'lastName', 'email', 'currentPassword']

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
  const schema = useMemo(() => createSchema(t, askPassword), [t, askPassword])
  // La password vive solo nel form: si smonta alla chiusura e la mutation ha gcTime 0
  const form = useForm<EditValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: user.first_name, lastName: user.last_name, email: user.email, currentPassword: '' },
  })
  const { errors } = form.formState
  // Messaggio del server mostrato nel dialog (troppe richieste, errori senza campo)
  const [notice, setNotice] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  // Evita il doppio invio: letto solo nei gestori di evento. Dopo il salvataggio resta attivo fino allo smontaggio:
  // durante l'animazione di chiusura il form è ancora nel DOM
  const submitting = useRef(false)

  const submit = async ({ firstName, lastName, email, currentPassword }: EditValues) => {
    if (submitting.current) return
    submitting.current = true
    setNotice(null)
    onBusyChange(true)
    try {
      await update.mutateAsync({
        id: user.id,
        firstName,
        lastName,
        email: emailEditable ? email : undefined,
        currentPassword: askPassword ? currentPassword : undefined,
      })
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const messages: Record<keyof EditValues, string | undefined> = {
          firstName: error.fieldErrors.first_name?.[0],
          lastName: error.fieldErrors.last_name?.[0],
          email: error.fieldErrors.email?.[0],
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
      } else {
        // 403 e 409 (es. users.state_changed): il messaggio del server è già tradotto, la lista si ricarica
        toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
        onClose()
      }
      return
    } finally {
      onBusyChange(false)
    }
    const emailChanged = emailEditable && email !== user.email
    toast.success(emailChanged ? t('users.editDialog.reinvited', { email }) : t('users.editDialog.done', { name: `${firstName} ${lastName}` }))
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

/** Modifica di nome, cognome ed email (questa solo per gli invitati). */
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
