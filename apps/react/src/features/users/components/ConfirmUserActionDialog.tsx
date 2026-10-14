import { LoaderCircle } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import PasswordInput from '@/components/PasswordInput'
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { needsPassword } from '@/features/users/actions'
import { useCancelInvitation, useDisableUser, useEnableUser, useResendInvitation, type ManagedUser } from '@/features/users/api'
import { focusTrigger, USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'
import { isApiError } from '@/lib/api'

export type ConfirmAction = 'resend' | 'cancel' | 'disable' | 'enable'

interface ConfirmUserActionDialogProps {
  user: ManagedUser | null
  action: ConfirmAction | null
  onClose: () => void
  /** Attributo dei pulsanti che aprono il dialog: alla chiusura il focus torna lì (vedi lib/focusTrigger) */
  triggerAttribute?: string
  /** Valore dell'attributo del pulsante d'origine; di default l'id dell'utente (un solo pulsante per riga) */
  triggerKey?: (user: ManagedUser, action: ConfirmAction) => string | number
}

interface PasswordValues {
  currentPassword: string
}

interface ConfirmBodyProps {
  user: ManagedUser
  action: ConfirmAction
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

/** Il corpo si monta a ogni apertura: password e errori ripartono vuoti. */
const ConfirmBody = ({ user, action, onClose, onBusyChange }: ConfirmBodyProps) => {
  const { t } = useTranslation()
  const resend = useResendInvitation()
  const cancel = useCancelInvitation()
  const disable = useDisableUser()
  const enable = useEnableUser()
  const askPassword = needsPassword(user, action)
  const form = useForm<PasswordValues>({ defaultValues: { currentPassword: '' } })
  const { errors } = form.formState
  const [pending, setPending] = useState(false)
  // Evita il doppio invio: letto solo nei gestori di evento. Dopo l'azione riuscita resta attivo fino allo smontaggio:
  // durante l'animazione di chiusura il form è ancora nel DOM (il corpo si rimonta a ogni apertura)
  const submitting = useRef(false)

  const run = async (currentPassword: string) => {
    switch (action) {
      case 'resend':
        return resend.mutateAsync(user.id)
      case 'cancel':
        return cancel.mutateAsync(user.id)
      case 'disable':
        return disable.mutateAsync({ id: user.id, currentPassword: askPassword ? currentPassword : undefined })
      case 'enable':
        return enable.mutateAsync({ id: user.id, currentPassword: askPassword ? currentPassword : undefined })
    }
  }

  const submit = async ({ currentPassword }: PasswordValues) => {
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    onBusyChange(true)
    try {
      await run(currentPassword)
    } catch (error) {
      submitting.current = false
      setPending(false)
      const passwordError = isApiError(error, 'validation') ? error.fieldErrors.current_password?.[0] : undefined
      if (passwordError) {
        form.setError('currentPassword', { message: passwordError }, { shouldFocus: true })
      } else {
        // 429, 409 e 422 sull'utente: il messaggio del server è già tradotto
        toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
        onClose()
      }
      return
    } finally {
      onBusyChange(false)
    }
    toast.success(t(`users.confirm.${action}.done`, { name: user.name }))
    onClose()
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => form.handleSubmit(submit)(event)

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <AlertDialogHeader>
        <AlertDialogTitle>{t(`users.confirm.${action}.title`, { name: user.name })}</AlertDialogTitle>
        <AlertDialogDescription>{t(`users.confirm.${action}.description`, { name: user.name })}</AlertDialogDescription>
      </AlertDialogHeader>
      {askPassword && (
        <>
          <Alert>
            <AlertDescription>{t('users.confirm.adminNotice')}</AlertDescription>
          </Alert>
          <Field data-invalid={errors.currentPassword ? true : undefined}>
            <FieldLabel htmlFor="confirm-password">{t('users.confirm.password')}</FieldLabel>
            <PasswordInput
              id="confirm-password"
              autoComplete="current-password"
              aria-invalid={errors.currentPassword ? true : undefined}
              aria-describedby={errors.currentPassword ? 'confirm-password-error' : undefined}
              {...form.register('currentPassword', { required: t('validation.passwordRequired') })}
            />
            <FieldError id="confirm-password-error">{errors.currentPassword?.message}</FieldError>
          </Field>
        </>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel type="button" disabled={pending}>
          {t('users.confirm.back')}
        </AlertDialogCancel>
        <Button type="submit" variant={action === 'cancel' || action === 'disable' ? 'destructive' : 'default'} disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t(`users.confirm.${action}.action`, { name: user.name })}
        </Button>
      </AlertDialogFooter>
    </form>
  )
}

/** Conferma esplicita delle azioni di riga; per gli admin chiede la password di chi agisce. */
const ConfirmUserActionDialog = ({
  user,
  action,
  onClose,
  triggerAttribute = USER_TRIGGER_ATTRIBUTE,
  triggerKey = (target) => target.id,
}: ConfirmUserActionDialogProps) => {
  const open = user !== null && action !== null
  // Contenuto conservato durante l'animazione di chiusura
  const [last, setLast] = useState<{ user: ManagedUser; action: ConfirmAction } | null>(null)
  if (user !== null && action !== null && (last?.user !== user || last.action !== action)) setLast({ user, action })
  const shown = open ? { user, action } : last
  // Conta le aperture: ogni apertura rimonta il corpo (anche se avviene durante l'animazione di chiusura)
  const [openCount, setOpenCount] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount(openCount + 1)
  }
  // Durante l'invio il dialog non si chiude (Escape, clic fuori): un errore sulla password non va perso
  const [busy, setBusy] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(triggerAttribute, shown ? triggerKey(shown.user, shown.action) : null)
        }}
      >
        {shown && <ConfirmBody key={`${openCount}-${shown.user.id}-${shown.action}`} user={shown.user} action={shown.action} onClose={onClose} onBusyChange={setBusy} />}
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default ConfirmUserActionDialog
