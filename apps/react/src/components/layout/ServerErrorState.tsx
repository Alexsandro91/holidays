import { CircleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface ServerErrorStateProps {
  /** true se il server non è raggiungibile: solo allora si suggerisce di controllare la connessione */
  isNetworkError: boolean
  onRetry: () => void
}

const ServerErrorState = ({ isNetworkError, onRetry }: ServerErrorStateProps) => {
  const { t } = useTranslation()
  return (
    <main id="main" className="grid min-h-svh place-items-center px-4">
      <Alert className="max-w-md">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{t('errors.serverTitle')}</AlertTitle>
        <AlertDescription className="grid gap-3">
          <p>{t(isNetworkError ? 'errors.network' : 'errors.generic')}</p>
          <Button variant="outline" size="sm" className="justify-self-start" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  )
}

export default ServerErrorState
