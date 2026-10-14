import { Outlet } from 'react-router'
import { useCurrentUser, type User } from '@/features/auth/api'
import ForbiddenPage from '@/pages/ForbiddenPage'

interface RoleRouteProps {
  /** Ruoli ammessi alle pagine figlie */
  roles: User['role'][]
}

/** Pagine riservate ad alcuni ruoli. Sta dentro ProtectedRoute: l'utente c'è già, qui conta solo il ruolo. */
const RoleRoute = ({ roles }: RoleRouteProps) => {
  const { data: user } = useCurrentUser()

  if (!user || !roles.includes(user.role)) return <ForbiddenPage />

  return <Outlet />
}

export default RoleRoute
