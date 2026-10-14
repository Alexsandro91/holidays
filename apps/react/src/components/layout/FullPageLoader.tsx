import { LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface FullPageLoaderProps {
  /** Classi aggiuntive (es. un'altezza minore quando il loader sta dentro un layout) */
  className?: string
}

const FullPageLoader = ({ className }: FullPageLoaderProps) => {
  const { t } = useTranslation()
  return (
    <div role="status" className={cn('grid min-h-svh place-items-center', className)}>
      <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  )
}

export default FullPageLoader
