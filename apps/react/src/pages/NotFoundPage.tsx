import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'

const NotFoundPage = () => {
  const { t } = useTranslation()
  return (
    <main id="main" className="grid min-h-svh place-items-center px-4">
      <div className="w-full max-w-md">
        <PageHeading title={t('notFound.title')} description={t('notFound.description')} />
        <Button asChild>
          <Link to="/">{t('notFound.back')}</Link>
        </Button>
      </div>
    </main>
  )
}

export default NotFoundPage
