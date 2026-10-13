import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'

const PrivacyPage = () => {
  const { t } = useTranslation()

  return (
    <>
      <PageHeading title={t('privacy.title')} />
      <div className="grid gap-4">
        <p className="text-[15px] leading-relaxed">{t('privacy.placeholder')}</p>
        <Button asChild variant="link" className="justify-self-start px-0">
          {/* Chi non è entrato finisce comunque sull'accesso (ProtectedRoute) */}
          <Link to="/">
            <ArrowLeft aria-hidden="true" />
            {t('privacy.back')}
          </Link>
        </Button>
      </div>
    </>
  )
}

export default PrivacyPage
