import { Ellipsis } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { Location } from '@/features/locations/api'
import { LOCATION_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

export type LocationAction = 'primary' | 'archive' | 'restore'

interface LocationActionsMenuProps {
  location: Location
  onSelect: (action: LocationAction) => void
}

/**
 * Menu di riga di una sede (spec SP2 fase 1 §5.2): Apri, Imposta come principale, Vedi persone, Archivia o Ripristina.
 * Archivia c'è sempre per una sede attiva: se non si può, il dialog spiega perché invece di una voce spenta e muta.
 */
const LocationActionsMenu = ({ location, onSelect }: LocationActionsMenuProps) => {
  const { t } = useTranslation()
  const archived = location.archived_at !== null
  // Impostato dal gestore della voce scelta, letto alla chiusura del menu (mai durante il render)
  const selected = useRef(false)
  const choose = (action: LocationAction) => {
    selected.current = true
    onSelect(action)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('locations.actions.menu', { name: location.name })} {...{ [LOCATION_TRIGGER_ATTRIBUTE]: location.id }}>
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      {/* Con una voce che apre un dialog il focus lo gestisce il dialog (vedi lib/focusTrigger) */}
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (selected.current) event.preventDefault()
          selected.current = false
        }}
      >
        <DropdownMenuItem asChild>
          <Link to={`/admin/locations/${location.id}`}>{t('locations.actions.open')}</Link>
        </DropdownMenuItem>
        {!location.is_primary && !archived && <DropdownMenuItem onSelect={() => choose('primary')}>{t('locations.actions.primary')}</DropdownMenuItem>}
        <DropdownMenuItem asChild>
          <Link to={`/users?location=${location.id}`}>{t('locations.actions.people')}</Link>
        </DropdownMenuItem>
        {archived ? (
          <DropdownMenuItem onSelect={() => choose('restore')}>{t('locations.actions.restore')}</DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onSelect={() => choose('archive')}>
            {t('locations.actions.archive')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default LocationActionsMenu
