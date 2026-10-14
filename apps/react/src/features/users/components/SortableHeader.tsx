import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Quanto serve della colonna di TanStack Table */
interface SortableColumn {
  getIsSorted: () => false | 'asc' | 'desc'
  toggleSorting: (desc?: boolean) => void
}

interface SortableHeaderProps {
  label: string
  column: SortableColumn
}

/**
 * Intestazione ordinabile: un pulsante dentro il `th`, lo stato lo dice `aria-sort` sul `th` (vedi UsersTable).
 * Prima crescente, poi alterna: l'ordinamento non si toglie mai (il default del server è comunque per nome).
 */
const SortableHeader = ({ label, column }: SortableHeaderProps) => {
  const sorted = column.getIsSorted()
  const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown
  return (
    <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(sorted === 'asc')} className="-ml-3 font-medium text-foreground">
      {label}
      <Icon className={sorted ? undefined : 'text-muted-foreground'} aria-hidden="true" />
    </Button>
  )
}

export default SortableHeader
