import { LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
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

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (changeRole.isPending) return
    onBusyChange(true)
    try {
      await changeRole.mutateAsync({ id: user.id, role })
      toast.success(t('users.roleDialog.done', { name: user.name }))
      onClose()
    } catch (error) {
      // 403/409 e simili: il messaggio del server è già tradotto
      if (isApiError(error, 'network')) toast.error(t('errors.network'))
      else toast.error(isApiError(error) ? error.message : t('errors.generic'))
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <RadioGroup value={role} onValueChange={(value) => isManagedRole(value) && setRole(value)} aria-label={t('users.inviteDialog.role')}>
        {ROLES.map((item) => (
          <Field key={item} orientation="horizontal">
            <RadioGroupItem value={item} id={`role-${item}`} />
            <FieldLabel htmlFor={`role-${item}`}>{t(`users.roles.${item}`)}</FieldLabel>
          </Field>
        ))}
      </RadioGroup>
      <DialogFooter>
        <Button type="submit" disabled={changeRole.isPending}>
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
