import { useTranslation } from 'react-i18next'
import PageHeading from '@/components/layout/PageHeading'
import { useCurrentUser } from '@/features/auth/api'
import MyBalancesSection from '@/features/home/components/MyBalancesSection'
import PendingApprovalsCard from '@/features/home/components/PendingApprovalsCard'
import UpcomingLeave from '@/features/home/components/UpcomingLeave'

/** Dashboard di chi è collegato (spec SP2 fase 3 §7.1): richieste da approvare, prossime assenze, saldi e tipi usabili. */
const HomePage = () => {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const firstName = user?.name.split(' ')[0] ?? ''

  return (
    // Larghezza di lettura: il contenuto della shell occupa tutto lo spazio disponibile
    <div className="max-w-3xl">
      <PageHeading title={t('home.greeting', { name: firstName })} description={t('home.subtitle')} />
      <div className="grid gap-8">
        <PendingApprovalsCard />
        <UpcomingLeave />
        <MyBalancesSection />
      </div>
    </div>
  )
}

export default HomePage
