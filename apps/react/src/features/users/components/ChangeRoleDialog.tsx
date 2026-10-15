import { LoaderCircle } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useChangeRole, type ManagedRole, type ManagedUser } from '@/features/users/api'
import { focusTrigger, USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'
import { isApiError } from '@/lib/api'

interface ChangeRoleDialogProps {
  user: ManagedUser | null
  onClose: () => void
}

const ROLES: ManagedRole[] = ['employee', 'manager']

const isManagedRole = (value: string): value is ManagedRole => value === 'employee' || value === 'manager'

interface RoleFormProps {
  user: ManagedUser
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

/** Il form vive dentro il dialog: si monta a ogni apertura e parte dal ruolo attuale. */
const RoleForm = ({ user, onClose, onBusyChange }: RoleFormProps) => {
  const { t } = useTranslation()
  const changeRole = useChangeRole()
  const [role, setRole] = useState<ManagedRole>(user.role === 'manager' ? 'manager' : 'employee')
  // Uno stagista può essere solo Utente (spec SP2 fase 1 §7.3): il server rifiuta comunque con 422
  const intern = user.employment_type === 'intern'
  // Rifiuto del server sul campo role (es. la persona è diventata stagista nel frattempo)
  const [roleError, setRoleError] = useState<string | null>(null)
  // Stesso ruolo: niente richiesta (e niente evento role_changed inutile)
  const unchanged = role === user.role
  // Evita il doppio invio: letto solo nei gestori di evento. Dopo il salvataggio resta attivo fino allo smontaggio
  // (il form si rimonta a ogni apertura del dialog)
  const submitting = useRef(false)

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting.current || unchanged) return
    submitting.current = true
    setRoleError(null)
    onBusyChange(true)
    try {
      await changeRole.mutateAsync({ id: user.id, role })
    } catch (error) {
      submitting.current = false
      const fieldError = isApiError(error, 'validation') ? error.fieldErrors.role?.[0] : undefined
      // 403/409 e simili: il messaggio del server è già tradotto
      if (fieldError) setRoleError(fieldError)
      else if (isApiError(error, 'network')) toast.error(t('errors.network'))
      else toast.error(isApiError(error) ? error.message : t('errors.generic'))
      return
    } finally {
      onBusyChange(false)
    }
    toast.success(t('users.roleDialog.done', { name: user.name }))
    onClose()
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <RadioGroup
        value={role}
        onValueChange={(value) => isManagedRole(value) && setRole(value)}
        aria-label={t('users.inviteDialog.role')}
        aria-invalid={roleError ? true : undefined}
        aria-describedby={[intern ? 'role-intern-note' : '', roleError ? 'role-error' : ''].filter(Boolean).join(' ') || undefined}
      >
        {ROLES.map((item) => (
          <Field key={item} orientation="horizontal" data-disabled={intern && item === 'manager' ? true : undefined}>
            <RadioGroupItem value={item} id={`role-${item}`} disabled={intern && item === 'manager'} />
            <FieldLabel htmlFor={`role-${item}`}>{t(`users.roles.${item}`)}</FieldLabel>
          </Field>
        ))}
      </RadioGroup>
      {intern && (
        <p id="role-intern-note" className="text-sm text-muted-foreground">
          {t('users.internRoleOnly')}
        </p>
      )}
      <FieldError id="role-error">{roleError}</FieldError>
      <DialogFooter>
        <Button type="submit" disabled={changeRole.isPending || unchanged}>
          {changeRole.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('users.roleDialog.submit')}
        </Button>
      </DialogFooter>
    </form>
  )
}

const ChangeRoleDialog = ({ user, onClose }: ChangeRoleDialogProps) => {
  const { t } = useTranslation()
  // Il nome resta nel titolo durante l'animazione di chiusura
  const [lastUser, setLastUser] = useState<ManagedUser | null>(user)
  if (user !== null && user !== lastUser) setLastUser(user)
  const shown = user ?? lastUser
  // Durante l'invio il dialog non si chiude (Escape, clic fuori)
  const [busy, setBusy] = useState(false)

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(USER_TRIGGER_ATTRIBUTE, shown?.id ?? null)
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('users.roleDialog.title', { name: shown?.name ?? '' })}</DialogTitle>
        </DialogHeader>
        {user !== null && <RoleForm key={user.id} user={user} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  )
}

export default ChangeRoleDialog
