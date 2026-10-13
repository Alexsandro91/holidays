import { ShieldAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'

/** 403 dentro la shell: la pagina esiste ma non è per il ruolo di chi la apre. */
const ForbiddenPage = () => {
  const { t } = useTranslation()
  return (
    <div className="max-w-md">
      <PageHeading icon={<ShieldAlert className="size-5" aria-hidden="true" />} title={t('forbidden.title')} description={t('forbidden.description')} />
      <Button asChild>
        <Link to="/">{t('forbidden.back')}</Link>
      </Button>
    </div>
  )
}

export default ForbiddenPage
