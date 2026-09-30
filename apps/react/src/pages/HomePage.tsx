import { CalendarDays } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PageHeading from '@/components/layout/PageHeading'
import { Card, CardContent } from '@/components/ui/card'
import { useCurrentUser } from '@/features/auth/api'

const HomePage = () => {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const firstName = user?.name.split(' ')[0] ?? ''

  return (
    <div className="grid gap-6">
      <PageHeading title={t('home.greeting', { name: firstName })} description={t('home.subtitle')} />
      <Card>
        <CardContent className="flex items-start gap-3">
          <CalendarDays className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-[15px] text-muted-foreground">{t('home.comingSoon')}</p>
        </CardContent>
      </Card>
    </div>
  )
}

export default HomePage
