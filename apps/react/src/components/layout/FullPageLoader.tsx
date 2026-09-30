import { LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const FullPageLoader = () => {
  const { t } = useTranslation()
  return (
    <div role="status" className="grid min-h-svh place-items-center">
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  )
}

export default FullPageLoader
