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
import { DialogFooter } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useInviteAdmin } from '@/features/administrators/api'
import { emailField } from '@/features/auth/validation'
import { isApiError } from '@/lib/api'

// Stesse regole dell'invito di dipendenti e responsabili, più la password di chi agisce (spec §4)
const createSchema = (t: TFunction) =>
  z.object({
    name: z.string().trim().min(1, t('validation.nameRequired')),
    email: emailField(t),
    currentPassword: z.string().min(1, t('validation.passwordRequired')),
  })

type InviteAdminValues = z.infer<ReturnType<typeof createSchema>>

const FIELDS: (keyof InviteAdminValues)[] = ['name', 'email', 'currentPassword']

interface InviteAdminFormProps {
  onDone: () => void
  onBusyChange: (busy: boolean) => void
}

/** Invito di una persona nuova come admin. Si monta a ogni apertura del dialog: campi ed errori ripartono vuoti. */
const InviteAdminForm = ({ onDone, onBusyChange }: InviteAdminFormProps) => {
  const { t } = useTranslation()
  const invite = useInviteAdmin()
  const schema = useMemo(() => createSchema(t), [t])
  const form = useForm<InviteAdminValues>({ resolver: zodResolver(schema), defaultValues: { name: '', email: '', currentPassword: '' } })
  const { errors } = form.formState
  // Messaggio del server mostrato nel dialog (troppi tentativi, errori senza campo)
  const [notice, setNotice] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  // Evita il doppio invio: letto solo nei gestori di evento. Dopo l'invito riuscito resta attivo fino allo smontaggio:
  // durante l'animazione di chiusura il form è ancora nel DOM (il form si rimonta a ogni apertura)
  const submitting = useRef(false)

  const submit = async (values: InviteAdminValues) => {
    if (submitting.current) return
    submitting.current = true
    setNotice(null)
    onBusyChange(true)
    try {
      await invite.mutateAsync(values)
    } catch (error) {
      submitting.current = false
      if (isApiError(error, 'validation')) {
        const messages: Record<keyof InviteAdminValues, string | undefined> = {
          name: error.fieldErrors.name?.[0],
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
        // 403 e 409: il messaggio del server è già tradotto
        toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
      }
      return
    } finally {
      onBusyChange(false)
    }
    toast.success(t('administrators.grant.invited', { email: values.email.trim() }))
    onDone()
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
        <Field data-invalid={errors.name ? true : undefined}>
          <FieldLabel htmlFor="invite-admin-name">{t('administrators.grant.name')}</FieldLabel>
          <Input
            id="invite-admin-name"
            autoComplete="off"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? 'invite-admin-name-error' : undefined}
            {...form.register('name')}
          />
          <FieldError id="invite-admin-name-error">{errors.name?.message}</FieldError>
        </Field>
        <Field data-invalid={errors.email ? true : undefined}>
          <FieldLabel htmlFor="invite-admin-email">{t('administrators.grant.email')}</FieldLabel>
          <Input
            id="invite-admin-email"
            type="email"
            autoComplete="off"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'invite-admin-email-error invite-admin-hint' : 'invite-admin-hint'}
            {...form.register('email')}
          />
          <FieldDescription id="invite-admin-hint">{t('administrators.grant.inviteHint')}</FieldDescription>
          <FieldError id="invite-admin-email-error">{errors.email?.message}</FieldError>
        </Field>
        <Field data-invalid={errors.currentPassword ? true : undefined}>
          <FieldLabel htmlFor="invite-admin-password">{t('administrators.grant.password')}</FieldLabel>
          <PasswordInput
            id="invite-admin-password"
            autoComplete="current-password"
            aria-invalid={errors.currentPassword ? true : undefined}
            aria-describedby={errors.currentPassword ? 'invite-admin-password-error' : undefined}
            {...form.register('currentPassword')}
          />
          <FieldError id="invite-admin-password-error">{errors.currentPassword?.message}</FieldError>
        </Field>
        {notice && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}
      </FieldGroup>
      <DialogFooter className="mt-4">
        {/* aria-disabled: dopo un 429 il pulsante resta focalizzabile (il blocco è nel gestore dell'invio) */}
        <Button type="submit" aria-disabled={invite.isPending || locked || undefined}>
          {invite.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('administrators.grant.inviteSubmit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

export default InviteAdminForm
