import { LoaderCircle } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FieldGroup } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { useUpdateUserEnablements, useUserAbsenceTypes, type AbsenceTypeOption } from '@/features/absenceTypes/api'
import AbsenceTypeCheckboxField from '@/features/absenceTypes/components/AbsenceTypeCheckboxField'
import type { ManagedUser } from '@/features/users/api'
import { isApiError } from '@/lib/api'
import { focusTrigger, USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface UserAbsenceTypesDialogProps {
  user: ManagedUser | null
  onClose: () => void
}

interface EnablementsFormProps {
  user: ManagedUser
  options: AbsenceTypeOption[]
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

/** Parte dalle abilitazioni del server: si monta solo quando sono arrivate. */
const EnablementsForm = ({ user, options, onClose, onBusyChange }: EnablementsFormProps) => {
  const { t } = useTranslation()
  const update = useUpdateUserEnablements(user.id)
  const [selected, setSelected] = useState<number[]>(options.filter((option) => option.requires_enablement && option.enabled).map((option) => option.id))
  const enablable = options.filter((option) => option.requires_enablement)
  const always = options.filter((option) => !option.requires_enablement)

  const toggle = (id: number, checked: boolean) => setSelected((current) => (checked ? [...current, id] : current.filter((item) => item !== id)))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (update.isPending) return
    onBusyChange(true)
    try {
      await update.mutateAsync(selected)
      toast.success(t('absenceTypes.enablements.saved', { name: user.name }))
      onClose()
    } catch (error) {
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    } finally {
      onBusyChange(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate>
      <FieldGroup>
        {always.length > 0 && (
          <div>
            <h3 className="mb-1 text-sm font-medium">{t('absenceTypes.enablements.always')}</h3>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              {always.map((option) => (
                <li key={option.id}>{option.name}</li>
              ))}
            </ul>
          </div>
        )}
        {enablable.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('absenceTypes.enablements.none')}</p>
        ) : (
          <fieldset className="grid gap-3">
            <legend className="mb-1 text-sm font-medium">{t('absenceTypes.enablements.enabled')}</legend>
            {enablable.map((option) => (
              <AbsenceTypeCheckboxField
                key={option.id}
                id={`user-absence-type-${option.id}`}
                label={option.name}
                checked={selected.includes(option.id)}
                onCheckedChange={(checked) => toggle(option.id, checked)}
              />
            ))}
          </fieldset>
        )}
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('absenceTypes.enablements.save')}
        </Button>
      </DialogFooter>
    </form>
  )
}

interface BodyProps {
  user: ManagedUser
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

const EnablementsBody = ({ user, onClose, onBusyChange }: BodyProps) => {
  const { t } = useTranslation()
  const types = useUserAbsenceTypes(user.id)
  if (types.isPending) {
    return (
      <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    )
  }
  if (types.isError) return <p role="alert">{t('absenceTypes.enablements.loadError')}</p>
  return <EnablementsForm user={user} options={types.data} onClose={onClose} onBusyChange={onBusyChange} />
}

/** Tipi di assenza di una persona e abilitazioni, dal menu di riga di Utenti (solo admin, spec SP2 fase 2 §3.4). */
const UserAbsenceTypesDialog = ({ user, onClose }: UserAbsenceTypesDialogProps) => {
  const { t } = useTranslation()
  const open = user !== null
  const [last, setLast] = useState<ManagedUser | null>(user)
  if (user !== null && user !== last) setLast(user)
  const shown = user ?? last
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
          focusTrigger(USER_TRIGGER_ATTRIBUTE, shown?.id ?? null)
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('absenceTypes.enablements.title', { name: shown?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('absenceTypes.enablements.description')}</DialogDescription>
        </DialogHeader>
        {/* Rimontato a ogni apertura e per ogni persona: le caselle ripartono dalle abilitazioni del server */}
        {user !== null && <EnablementsBody key={`${openCount}-${user.id}`} user={user} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  )
}

export default UserAbsenceTypesDialog
