import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useUserSchedules } from '@/features/locations/api'
import type { ManagedUser } from '@/features/users/api'
import UserScheduleForm from '@/features/users/components/UserScheduleForm'
import { focusTrigger, USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface UserScheduleDialogProps {
  user: ManagedUser | null
  onClose: () => void
}

interface ScheduleBodyProps {
  user: ManagedUser
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

/** Il form parte dai dati del server: si monta solo quando sono arrivati. */
const ScheduleBody = ({ user, onClose, onBusyChange }: ScheduleBodyProps) => {
  const { t } = useTranslation()
  const schedules = useUserSchedules(user.id)
  if (schedules.isPending) {
    return (
      <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }
  if (schedules.isError) return <p role="alert">{t('users.scheduleDialog.loadError')}</p>
  return <UserScheduleForm user={user} data={schedules.data} onClose={onClose} onBusyChange={onBusyChange} />
}

/** Orario di lavoro di una persona, dal menu di riga di Utenti (solo admin, spec SP2 fase 1 §5.4). */
const UserScheduleDialog = ({ user, onClose }: UserScheduleDialogProps) => {
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
          <DialogTitle>{t('users.scheduleDialog.title', { name: shown?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('users.scheduleDialog.description')}</DialogDescription>
        </DialogHeader>
        {/* Rimontato a ogni apertura e per ogni persona: form ed editor della settimana (che non si risincronizza da fuori)
            ripartono dai dati del server */}
        {user !== null && <ScheduleBody key={`${openCount}-${user.id}`} user={user} onClose={onClose} onBusyChange={setBusy} />}
      </DialogContent>
    </Dialog>
  )
}

export default UserScheduleDialog
