import { useTranslation } from 'react-i18next'

const SkipLink = () => {
  const { t } = useTranslation()
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-md bg-card px-4 py-2 text-sm font-medium shadow-lg focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
    >
      {t('nav.skip')}
    </a>
  )
}

export default SkipLink
