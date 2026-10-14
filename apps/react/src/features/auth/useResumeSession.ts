import { useNavigate } from 'react-router'
import { useRefreshCurrentUser } from '@/features/auth/api'
import { safeRedirect } from '@/lib/safeRedirect'

/**
 * Dopo un 409 already_authenticated (es. accesso fatto in un'altra scheda) la sessione c'è già: si rilegge l'utente
 * e si va alla destinazione, come fa GuestRoute. Restituisce false se l'utente non si riesce a rileggere.
 */
export const useResumeSession = () => {
  const refreshCurrentUser = useRefreshCurrentUser()
  const navigate = useNavigate()
  return async (redirect: string | null): Promise<boolean> => {
    try {
      await refreshCurrentUser()
    } catch {
      return false
    }
    navigate(safeRedirect(redirect), { replace: true })
    return true
  }
}
