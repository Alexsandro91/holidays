import { Ellipsis } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import type { BalanceOverviewRow } from '@/features/balances/api'

export type BalanceRowAction = 'open' | 'align' | 'adjust'

interface BalanceRowActionsProps {
  row: BalanceOverviewRow
  onSelect: (action: BalanceRowAction) => void
}

/** Menu di riga: Apri saldi sempre, Allinea e Rettifica solo con `can.adjust`. */
const BalanceRowActions = ({ row, onSelect }: BalanceRowActionsProps) => {
  const { t } = useTranslation()
  const actions: BalanceRowAction[] = row.can.adjust ? ['open', 'align', 'adjust'] : ['open']
  // Impostato dal gestore della voce scelta, letto alla chiusura del menu (mai durante il render)
  const selected = useRef(false)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('balances.page.actions.menu', { name: row.user.name })}>
          <Ellipsis aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      {/* Scegliendo una voce si apre un dialog e il focus lo gestisce lui (vedi lib/focusTrigger) */}
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          if (selected.current) event.preventDefault()
          selected.current = false
        }}
      >
        {actions.map((action) => (
          <DropdownMenuItem
            key={action}
            onSelect={() => {
              selected.current = true
              onSelect(action)
            }}
          >
            {t(`balances.page.actions.${action}`)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default BalanceRowActions
