import { CircleAlert, LoaderCircle, LogOut, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import PageHeading from '@/components/layout/PageHeading'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { isAlreadySignedOut, useLogout, type User } from '@/features/auth/api'

interface SignedInNoticeProps {
  user: User
}

/** Invito aperto con una sessione già attiva: per attivarlo bisogna prima uscire. */
const SignedInNotice = ({ user }: SignedInNoticeProps) => {
  const { t } = useTranslation()
  const logout = useLogout()
  const [failed, setFailed] = useState(false)

  const onLogout = () => {
    setFailed(false)
    // Uscita riuscita: l'utente in cache diventa null e la pagina carica l'invito
    logout.mutate(undefined, { onError: (error) => setFailed(!isAlreadySignedOut(error)) })
  }

  return (
    <>
      <PageHeading
        icon={<UserRound className="size-5" aria-hidden="true" />}
        title={t('invitation.signedIn.title')}
        description={t('invitation.signedIn.description', { name: user.name, email: user.email })}
      />
      <div className="grid gap-4">
        {/* Regione sempre presente: l'errore dell'uscita viene annunciato quando compare */}
        <div aria-live="polite">
          {failed && (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>{t('account.logoutError')}</AlertDescription>
            </Alert>
          )}
        </div>
        <Button type="button" size="lg" className="w-full" disabled={logout.isPending} onClick={onLogout}>
          {logout.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
          {t('account.logout')}
        </Button>
        <Button asChild variant="link" className="justify-self-start px-0">
          <Link to="/">{t('invitation.signedIn.home')}</Link>
        </Button>
      </div>
    </>
  )
}

export default SignedInNotice
