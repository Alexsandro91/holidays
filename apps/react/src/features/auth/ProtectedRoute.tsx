import { Navigate, Outlet, useLocation } from 'react-router'
import FullPageLoader from '@/components/layout/FullPageLoader'
import ServerErrorState from '@/components/layout/ServerErrorState'
import { useCurrentUser } from '@/features/auth/api'
import { isApiError } from '@/lib/api'

const ProtectedRoute = () => {
  const { data: user, error, isPending, refetch } = useCurrentUser()
  const location = useLocation()

  if (isPending) return <FullPageLoader />
  if (user === null) return <Navigate to="/login?reason=logged-out" replace />
  if (error && !isApiError(error, 'unauthenticated')) return <ServerErrorState onRetry={() => void refetch()} />

  if (error || !user) {
    const params = new URLSearchParams({ redirect: `${location.pathname}${location.search}` })
    // Dati ancora in cache ma 401: la sessione c'era ed è scaduta
    if (user) params.set('reason', 'expired')
    return <Navigate to={`/login?${params.toString()}`} replace />
  }

  return <Outlet />
}

export default ProtectedRoute
