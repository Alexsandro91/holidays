import { Ellipsis } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { AbsenceType } from '@/features/absenceTypes/api'
import { ABSENCE_TYPE_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

export type AbsenceTypeAction = 'edit' | 'moveUp' | 'moveDown' | 'resetName' | 'archive' | 'restore'

interface AbsenceTypeActionsMenuProps {
  absenceType: AbsenceType
  /** false nella scheda Archiviati: si riordinano solo i tipi attivi */
  reorderable: boolean
  isFirst: boolean
  isLast: boolean
  onSelect: (action: AbsenceTypeAction) => void
}

/** Azioni che aprono un dialog: il focus lo gestisce il dialog, non il ritorno al pulsante del menu. */
const OPENS_DIALOG: AbsenceTypeAction[] = ['edit', 'archive', 'restore']

/**
 * Menu di riga di un tipo di assenza (spec SP2 fase 2 §7.7): Modifica, Sposta su e giù (alternativa da tastiera al
 * trascinamento), Ripristina nome predefinito per un tipo di partenza rinominato, Archivia o Ripristina.
 */
const AbsenceTypeActionsMenu = ({ absenceType, reorderable, isFirst, isLast, onSelect }: AbsenceTypeActionsMenuProps) => {
  const { t } = useTranslation()
  const archived = absenceType.archived_at !== null
  // Impostato dal gestore della voce scelta, letto alla chiusura del menu (mai durante il render)
  const opensDialog = useRef(false)
  const choose = (action: AbsenceTypeAction) => {
    opensDialog.current = OPENS_DIALOG.includes(action)
    onSelect(action)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('absenceTypes.actions.menu', { name: absenceType.name })} {...{ [ABSENCE_TYPE_TRIGGER_ATTRIBUTE]: absenceType.id }}>
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (opensDialog.current) event.preventDefault()
          opensDialog.current = false
        }}
      >
        <DropdownMenuItem onSelect={() => choose('edit')}>{t('absenceTypes.actions.edit')}</DropdownMenuItem>
        {reorderable && !archived && !isFirst && <DropdownMenuItem onSelect={() => choose('moveUp')}>{t('absenceTypes.actions.moveUp')}</DropdownMenuItem>}
        {reorderable && !archived && !isLast && <DropdownMenuItem onSelect={() => choose('moveDown')}>{t('absenceTypes.actions.moveDown')}</DropdownMenuItem>}
        {absenceType.is_system && absenceType.custom_name !== null && (
          <DropdownMenuItem onSelect={() => choose('resetName')}>{t('absenceTypes.actions.resetName')}</DropdownMenuItem>
        )}
        {archived ? (
          <DropdownMenuItem onSelect={() => choose('restore')}>{t('absenceTypes.actions.restore')}</DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onSelect={() => choose('archive')}>
            {t('absenceTypes.actions.archive')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default AbsenceTypeActionsMenu
