import { CircleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface ServerErrorStateProps {
  onRetry: () => void
}

const ServerErrorState = ({ onRetry }: ServerErrorStateProps) => {
  const { t } = useTranslation()
  return (
    <main id="main" className="grid min-h-svh place-items-center px-4">
      <Alert className="max-w-md">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>{t('errors.serverTitle')}</AlertTitle>
        <AlertDescription className="grid gap-3">
          <p>{t('errors.network')}</p>
          <Button variant="outline" size="sm" className="justify-self-start" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        </AlertDescription>
      </Alert>
    </main>
  )
}

export default ServerErrorState
