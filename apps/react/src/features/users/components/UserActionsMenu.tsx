import { Ellipsis } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { availableActions, type UserAction } from '@/features/users/actions'
import type { ManagedUser } from '@/features/users/api'
import { USER_TRIGGER_ATTRIBUTE } from '@/features/users/focusReturn'

interface UserActionsMenuProps {
  user: ManagedUser
  onSelect: (action: UserAction) => void
}

/** Menu azioni di riga: mostra solo le azioni valide per quello stato e quel ruolo. */
const UserActionsMenu = ({ user, onSelect }: UserActionsMenuProps) => {
  const { t } = useTranslation()
  const actions = availableActions(user)
  if (actions.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('users.actions.menu', { name: user.name })} {...{ [USER_TRIGGER_ATTRIBUTE]: user.id }}>
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      {/* Ogni voce apre un dialog: il focus lo gestisce il dialog (vedi focusReturn), non la chiusura del menu */}
      <DropdownMenuContent align="end" onCloseAutoFocus={(event) => event.preventDefault()}>
        {actions.map((action) => (
          <DropdownMenuItem key={action} variant={action === 'disable' ? 'destructive' : 'default'} onSelect={() => onSelect(action)}>
            {t(`users.actions.${action}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default UserActionsMenu
