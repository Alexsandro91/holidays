import { useTranslation } from 'react-i18next'
import PageHeading from '@/components/layout/PageHeading'

/** Segnaposto di Ferie e permessi: il Task 10 lo sostituisce con il calendario e le schede. */
const LeavePage = () => {
  const { t } = useTranslation()
  return (
    <>
      <PageHeading title={t('leave.title')} />
      <p className="text-muted-foreground">{t('leave.placeholder')}</p>
    </>
  )
}

export default LeavePage
