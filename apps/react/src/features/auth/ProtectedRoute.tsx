import { useQueryClient } from '@tanstack/react-query'
import { Navigate, Outlet, useLocation } from 'react-router'
import FullPageLoader from '@/components/layout/FullPageLoader'
import ServerErrorState from '@/components/layout/ServerErrorState'
import { useCurrentUser } from '@/features/auth/api'
import { isApiError } from '@/lib/api'
import { rememberedSessionEnd, sessionEndReasonOf } from '@/lib/sessionEnd'

const ProtectedRoute = () => {
  const { data: user, error, isPending, refetch } = useCurrentUser()
  const location = useLocation()
  const queryClient = useQueryClient()

  if (isPending) return <FullPageLoader />
  if (user === null) return <Navigate to="/login?reason=logged-out" replace />
  // Errore di rete/5xx: pagina d'errore solo senza utente in cache; altrimenti si tengono i dati (e lo stato della pagina)
  if (error && !user && !isApiError(error, 'unauthenticated')) {
    return <ServerErrorState isNetworkError={isApiError(error, 'network')} onRetry={() => void refetch()} />
  }

  if (!user || (error && isApiError(error, 'unauthenticated'))) {
    const params = new URLSearchParams({ redirect: `${location.pathname}${location.search}` })
    // Motivo detto dal server (anche dopo una ricarica) o da una richiesta precedente; senza motivo ma con l'utente
    // ancora in cache la sessione c'era ed è scaduta
    const reason = sessionEndReasonOf(error) ?? rememberedSessionEnd(queryClient) ?? (user ? 'expired' : null)
    if (reason) params.set('reason', reason)
    return <Navigate to={`/login?${params.toString()}`} replace />
  }

  return <Outlet />
}

export default ProtectedRoute
