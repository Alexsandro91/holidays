import { LoaderCircle } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import PasswordInput from '@/components/PasswordInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useRevokeAdmin } from '@/features/administrators/api'
import { focusTrigger, REVOKE_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'
import type { ManagedRole, ManagedUser } from '@/features/users/api'
import { isApiError } from '@/lib/api'

interface RevokeAdminDialogProps {
  user: ManagedUser | null
  onClose: () => void
}

interface PasswordValues {
  currentPassword: string
}

const ROLES: ManagedRole[] = ['employee', 'manager']

const isManagedRole = (value: string): value is ManagedRole => value === 'employee' || value === 'manager'

interface RevokeBodyProps {
  user: ManagedUser
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

/** Il corpo si monta a ogni apertura: ruolo, password ed errori ripartono da zero. */
const RevokeBody = ({ user, onClose, onBusyChange }: RevokeBodyProps) => {
  const { t } = useTranslation()
  const revoke = useRevokeAdmin()
  const form = useForm<PasswordValues>({ defaultValues: { currentPassword: '' } })
  const { errors } = form.formState
  const [role, setRole] = useState<ManagedRole>('employee')
  const [pending, setPending] = useState(false)
  // Messaggio del server mostrato nel dialog (ultimo admin, troppi tentativi)
  const [notice, setNotice] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  // Evita il doppio invio: letto solo nei gestori di evento. Dopo la revoca riuscita resta attivo fino allo smontaggio:
  // durante l'animazione di chiusura il form è ancora nel DOM (il corpo si rimonta a ogni apertura)
  const submitting = useRef(false)

  const submit = async ({ currentPassword }: PasswordValues) => {
    if (submitting.current || locked) return
    submitting.current = true
    setPending(true)
    setNotice(null)
    onBusyChange(true)
    try {
      await revoke.mutateAsync({ id: user.id, role, currentPassword })
    } catch (error) {
      submitting.current = false
      setPending(false)
      if (isApiError(error, 'validation')) {
        const passwordError = error.fieldErrors.current_password?.[0]
        if (passwordError) form.setError('currentPassword', { message: passwordError }, { shouldFocus: true })
        else setNotice(error.fieldErrors.user?.[0] ?? error.message)
      } else if (isApiError(error, 'throttled')) {
        setNotice(error.message)
        setLocked(true)
      } else {
        // 403 e 409: il messaggio del server è già tradotto
        toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
        onClose()
      }
      return
    } finally {
      onBusyChange(false)
    }
    toast.success(t('administrators.revokeDialog.done', { name: user.name }))
    onClose()
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(submit)(event)

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <AlertDialogHeader>
        <AlertDialogTitle>{t('administrators.revokeDialog.title', { name: user.name })}</AlertDialogTitle>
        <AlertDialogDescription>{t('administrators.revokeDialog.description')}</AlertDialogDescription>
      </AlertDialogHeader>
      <FieldSet>
        <FieldLegend variant="label">{t('administrators.revokeDialog.newRole')}</FieldLegend>
        <RadioGroup value={role} onValueChange={(value) => isManagedRole(value) && setRole(value)}>
          {ROLES.map((item) => (
            <Field key={item} orientation="horizontal">
              <RadioGroupItem value={item} id={`revoke-role-${item}`} />
              <FieldLabel htmlFor={`revoke-role-${item}`}>{t(`users.roles.${item}`)}</FieldLabel>
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>
      <Field data-invalid={errors.currentPassword ? true : undefined}>
        <FieldLabel htmlFor="revoke-password">{t('administrators.revokeDialog.password')}</FieldLabel>
        <PasswordInput
          id="revoke-password"
          autoComplete="current-password"
          aria-invalid={errors.currentPassword ? true : undefined}
          aria-describedby={errors.currentPassword ? 'revoke-password-error' : undefined}
          {...form.register('currentPassword', { required: t('validation.passwordRequired') })}
        />
        <FieldError id="revoke-password-error">{errors.currentPassword?.message}</FieldError>
      </Field>
      {notice && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel type="button" disabled={pending}>
          {t('users.confirm.back')}
        </AlertDialogCancel>
        {/* aria-disabled: dopo un 429 il pulsante resta focalizzabile (il blocco è nel gestore dell'invio) */}
        <Button type="submit" variant="destructive" aria-disabled={pending || locked || undefined}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('administrators.revokeDialog.submit', { name: user.name })}
        </Button>
      </AlertDialogFooter>
    </form>
  )
}

/** Revoca del ruolo di amministratore: nuovo ruolo e password di chi agisce. */
const RevokeAdminDialog = ({ user, onClose }: RevokeAdminDialogProps) => {
  // Contenuto conservato durante l'animazione di chiusura
  const [last, setLast] = useState<ManagedUser | null>(user)
  if (user !== null && user !== last) setLast(user)
  const shown = user ?? last
  // Conta le aperture: ogni apertura rimonta il corpo (anche se avviene durante l'animazione di chiusura)
  const open = user !== null
  const [session, setSession] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setSession(session + 1)
  }
  // Durante l'invio il dialog non si chiude (Escape, clic fuori)
  const [busy, setBusy] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(REVOKE_TRIGGER_ATTRIBUTE, shown?.id ?? null)
        }}
      >
        {shown && <RevokeBody key={`${session}-${shown.id}`} user={shown} onClose={onClose} onBusyChange={setBusy} />}
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default RevokeAdminDialog
