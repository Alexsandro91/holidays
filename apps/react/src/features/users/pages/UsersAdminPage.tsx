import { useCallback, useState } from 'react'
import UserBalancesDialog from '@/features/balances/components/UserBalancesDialog'
import UserAbsenceTypesDialog from '@/features/absenceTypes/components/UserAbsenceTypesDialog'
import UserHistoryDialog from '@/features/history/components/UserHistoryDialog'
import type { ManagedUser } from '@/features/users/api'
import { availableActions, type UserAction } from '@/features/users/actions'
import ChangeRoleDialog from '@/features/users/components/ChangeRoleDialog'
import ConfirmUserActionDialog from '@/features/users/components/ConfirmUserActionDialog'
import EditUserDialog from '@/features/users/components/EditUserDialog'
import InviteUserDialog from '@/features/users/components/InviteUserDialog'
import UserActionsMenu from '@/features/users/components/UserActionsMenu'
import UserScheduleDialog from '@/features/users/components/UserScheduleDialog'
import UsersPage from '@/features/users/pages/UsersPage'

type ConfirmAction = Exclude<UserAction, 'changeRole' | 'edit' | 'schedule' | 'history' | 'balances' | 'absenceTypes'>

/** Pagina Utenti (responsabili e admin) con invito e azioni di riga. */
const UsersAdminPage = () => {
  const [confirm, setConfirm] = useState<{ user: ManagedUser; action: ConfirmAction } | null>(null)
  const [roleTarget, setRoleTarget] = useState<ManagedUser | null>(null)
  const [editTarget, setEditTarget] = useState<ManagedUser | null>(null)
  const [scheduleTarget, setScheduleTarget] = useState<ManagedUser | null>(null)
  const [historyTarget, setHistoryTarget] = useState<ManagedUser | null>(null)
  const [balancesTarget, setBalancesTarget] = useState<ManagedUser | null>(null)
  const [absenceTypesTarget, setAbsenceTypesTarget] = useState<ManagedUser | null>(null)

  // Stabile: la Data Table ricrea le colonne solo quando cambia davvero
  const renderActions = useCallback(
    (user: ManagedUser) =>
      availableActions(user).length > 0 ? (
        <UserActionsMenu
          user={user}
          onSelect={(action: UserAction) => {
            if (action === 'changeRole') setRoleTarget(user)
            else if (action === 'edit') setEditTarget(user)
            else if (action === 'schedule') setScheduleTarget(user)
            else if (action === 'history') setHistoryTarget(user)
            else if (action === 'balances') setBalancesTarget(user)
            else if (action === 'absenceTypes') setAbsenceTypesTarget(user)
            else setConfirm({ user, action })
          }}
        />
      ) : null,
    [],
  )

  return (
    <>
      <UsersPage
        headerAction={<InviteUserDialog />}
        renderActions={renderActions}
      />
      <ConfirmUserActionDialog user={confirm?.user ?? null} action={confirm?.action ?? null} onClose={() => setConfirm(null)} />
      <ChangeRoleDialog user={roleTarget} onClose={() => setRoleTarget(null)} />
      <EditUserDialog user={editTarget} onClose={() => setEditTarget(null)} />
      <UserScheduleDialog user={scheduleTarget} onClose={() => setScheduleTarget(null)} />
      <UserHistoryDialog user={historyTarget} onClose={() => setHistoryTarget(null)} />
      <UserBalancesDialog
        userId={balancesTarget?.id ?? null}
        userName={balancesTarget?.name ?? ''}
        locationId={balancesTarget?.location.id}
        onClose={() => setBalancesTarget(null)}
      />
      <UserAbsenceTypesDialog user={absenceTypesTarget} onClose={() => setAbsenceTypesTarget(null)} />
    </>
  )
}

export default UsersAdminPage
