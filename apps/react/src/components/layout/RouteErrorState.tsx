import { RotateCw, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'
import { reloadPage } from '@/lib/reload'

interface RouteErrorStateProps {
  /** true fuori dai layout (errore del layout stesso): la pagina ha il suo <main> */
  fullPage?: boolean
}

/**
 * errorElement delle route: tipicamente il chunk di una pagina caricata a richiesta che non si scarica (deploy nel
 * frattempo o rete assente). React.lazy ricorda l'errore, quindi l'unico rimedio è ricaricare la pagina.
 */
const RouteErrorState = ({ fullPage = false }: RouteErrorStateProps) => {
  const { t } = useTranslation()

  // Il contenuto cambia senza cambio di indirizzo: il focus va sul titolo (lo annuncia anche agli screen reader)
  useEffect(() => {
    document.getElementById('page-title')?.focus()
  }, [])

  const content = (
    <div className="w-full max-w-md">
      <PageHeading icon={<TriangleAlert className="size-5" aria-hidden="true" />} title={t('errors.pageTitle')} description={t('errors.page')} />
      <Button type="button" onClick={reloadPage}>
        <RotateCw aria-hidden="true" />
        {t('errors.reload')}
      </Button>
    </div>
  )

  if (!fullPage) return content

  return (
    <main id="main" tabIndex={-1} className="grid min-h-svh place-items-center px-4 outline-none">
      {content}
    </main>
  )
}

export default RouteErrorState
