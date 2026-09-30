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
  // Errore di rete/5xx: pagina d'errore solo senza utente in cache; altrimenti si tengono i dati (e lo stato della pagina)
  if (error && !user && !isApiError(error, 'unauthenticated')) return <ServerErrorState onRetry={() => void refetch()} />

  if (!user || (error && isApiError(error, 'unauthenticated'))) {
    const params = new URLSearchParams({ redirect: `${location.pathname}${location.search}` })
    // Dati ancora in cache ma 401: la sessione c'era ed è scaduta
    if (user) params.set('reason', 'expired')
    return <Navigate to={`/login?${params.toString()}`} replace />
  }

  return <Outlet />
}

export default ProtectedRoute
