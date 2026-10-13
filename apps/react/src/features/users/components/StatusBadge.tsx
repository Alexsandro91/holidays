import { Badge } from '@/components/ui/badge'
import type { ManagedUser } from '@/features/users/api'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  user: ManagedUser
}

/** Stato sempre in testo: il colore non è l'unico segnale. */
const StatusBadge = ({ user }: StatusBadgeProps) => (
  <Badge variant={user.status === 'active' ? 'secondary' : 'outline'} className={cn(user.status === 'disabled' && 'text-muted-foreground')}>
    {user.status_label}
  </Badge>
)

export default StatusBadge
