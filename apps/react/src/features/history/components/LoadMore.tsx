import { LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface LoadMoreProps {
  pending: boolean
  /** Caricamento della pagina successiva fallito: errore in linea con Riprova, le tappe già caricate restano */
  failed: boolean
  onLoad: () => void
  /** Testi propri (es. i movimenti dei saldi); di default quelli dello storico */
  labels?: { loadMore: string; error: string }
}

/** "Carica altre" in fondo allo storico, o il suo errore con Riprova. */
const LoadMore = ({ pending, failed, onLoad, labels }: LoadMoreProps) => {
  const { t } = useTranslation()
  const spinner = pending && <LoaderCircle className="animate-spin" aria-hidden="true" />

  if (failed) {
    return (
      <div role="alert" className="grid justify-items-start gap-2">
        <p>{labels?.error ?? t('history.loadMoreError')}</p>
        <Button variant="outline" disabled={pending} onClick={onLoad}>
          {spinner}
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  return (
    <Button variant="outline" className="justify-self-start" disabled={pending} onClick={onLoad}>
      {spinner}
      {labels?.loadMore ?? t('history.loadMore')}
    </Button>
  )
}

export default LoadMore
