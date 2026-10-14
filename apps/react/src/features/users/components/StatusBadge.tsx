import { Badge } from '@/components/ui/badge'
import type { ManagedUser } from '@/features/users/api'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  user: ManagedUser
}

// Colore di significato (token in index.css, contrasto AA nei due temi): attivo verde, invitato ambra, disattivato grigio
const STATUS_CLASSES: Record<ManagedUser['status'], string> = {
  active: 'bg-status-active text-status-active-foreground',
  invited: 'bg-status-invited text-status-invited-foreground',
  disabled: 'bg-status-disabled text-status-disabled-foreground',
}

/** Stato sempre in testo: il colore non è l'unico segnale. */
const StatusBadge = ({ user }: StatusBadgeProps) => (
  <Badge variant="secondary" data-status={user.status} className={cn(STATUS_CLASSES[user.status])}>
    {user.status_label}
  </Badge>
)

export default StatusBadge
