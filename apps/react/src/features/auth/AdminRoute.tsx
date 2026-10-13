import { Outlet } from 'react-router'
import { useCurrentUser } from '@/features/auth/api'
import ForbiddenPage from '@/pages/ForbiddenPage'

/** Pagine dell'area admin. Sta dentro ProtectedRoute: l'utente c'è già, qui conta solo il ruolo. */
const AdminRoute = () => {
  const { data: user } = useCurrentUser()

  if (user?.role !== 'admin') return <ForbiddenPage />

  return <Outlet />
}

export default AdminRoute
