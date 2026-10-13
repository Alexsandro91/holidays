import { Badge } from '@/components/ui/badge'
import type { ManagedUser } from '@/features/users/api'

interface RoleBadgeProps {
  user: ManagedUser
}

/** Ruolo sempre in testo: il colore non è l'unico segnale. */
const RoleBadge = ({ user }: RoleBadgeProps) => <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role_label}</Badge>

export default RoleBadge
