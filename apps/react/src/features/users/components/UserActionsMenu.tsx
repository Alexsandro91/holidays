import { Ellipsis } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { availableActions, type UserAction } from '@/features/users/actions'
import type { ManagedUser } from '@/features/users/api'
import { USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface UserActionsMenuProps {
  user: ManagedUser
  onSelect: (action: UserAction) => void
}

/** Menu azioni di riga: mostra solo le azioni valide per quello stato e quel ruolo. */
const UserActionsMenu = ({ user, onSelect }: UserActionsMenuProps) => {
  const { t } = useTranslation()
  const actions = availableActions(user)
  // Impostato dal gestore della voce scelta, letto alla chiusura del menu (mai durante il render)
  const selected = useRef(false)
  if (actions.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('users.actions.menu', { name: user.name })} {...{ [USER_TRIGGER_ATTRIBUTE]: user.id }}>
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      {/* Scegliendo una voce si apre un dialog e il focus lo gestisce lui (vedi lib/focusTrigger);
          chiudendo il menu senza scelta (Escape, clic fuori) il focus torna al trigger come di default */}
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (selected.current) event.preventDefault()
          selected.current = false
        }}
      >
        {actions.map((action) => (
          <DropdownMenuItem key={action} variant={action === 'disable' ? 'destructive' : 'default'} onSelect={() => {
              selected.current = true
              onSelect(action)
            }}>
            {t(`users.actions.${action}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default UserActionsMenu
