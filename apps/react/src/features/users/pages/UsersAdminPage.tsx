import { useCallback, useState } from 'react'
import type { ManagedUser } from '@/features/users/api'
import { availableActions, type UserAction } from '@/features/users/actions'
import ChangeRoleDialog from '@/features/users/components/ChangeRoleDialog'
import ConfirmUserActionDialog from '@/features/users/components/ConfirmUserActionDialog'
import InviteUserDialog from '@/features/users/components/InviteUserDialog'
import UserActionsMenu from '@/features/users/components/UserActionsMenu'
import UsersPage from '@/features/users/pages/UsersPage'

type ConfirmAction = Exclude<UserAction, 'changeRole'>

/** Pagina Utenti (responsabili e admin) con invito e azioni di riga. */
const UsersAdminPage = () => {
  const [confirm, setConfirm] = useState<{ user: ManagedUser; action: ConfirmAction } | null>(null)
  const [roleTarget, setRoleTarget] = useState<ManagedUser | null>(null)

  // Stabile: la Data Table ricrea le colonne solo quando cambia davvero
  const renderActions = useCallback(
    (user: ManagedUser) =>
      availableActions(user).length > 0 ? (
        <UserActionsMenu
          user={user}
          onSelect={(action: UserAction) => {
            if (action === 'changeRole') setRoleTarget(user)
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
    </>
  )
}

export default UsersAdminPage
