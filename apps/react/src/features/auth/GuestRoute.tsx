import { Navigate, Outlet, useSearchParams } from 'react-router'
import FullPageLoader from '@/components/layout/FullPageLoader'
import { useCurrentUser } from '@/features/auth/api'
import { safeRedirect } from '@/lib/safeRedirect'

/** Pagine di accesso: chi ha già una sessione valida va direttamente alla destinazione. */
const GuestRoute = () => {
  const { data: user, isPending, isError } = useCurrentUser()
  const [searchParams] = useSearchParams()

  if (isPending) return <FullPageLoader />
  if (user && !isError) return <Navigate to={safeRedirect(searchParams.get('redirect'))} replace />

  return <Outlet />
}

export default GuestRoute
