import { useTranslation } from 'react-i18next'
import PageHeading from '@/components/layout/PageHeading'
import { useCurrentUser } from '@/features/auth/api'
import HistoryCard from '@/features/profile/components/HistoryCard'
import PasswordCard from '@/features/profile/components/PasswordCard'
import PersonalDetailsCard from '@/features/profile/components/PersonalDetailsCard'
import PreferencesCard from '@/features/profile/components/PreferencesCard'

/** Profilo di chi è collegato, per ogni ruolo: dati personali, password, preferenze e storico (spec fase 4 §3.2). */
const ProfilePage = () => {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()

  // ProtectedRoute garantisce l'utente: questo ramo copre solo l'istante del logout
  if (!user) return null

  return (
    <>
      <PageHeading title={t('profile.title')} description={t('profile.description')} />
      {/* Da lg due colonne su tutta la larghezza: dati e password a sinistra, preferenze e storico a destra. Sotto lg una
          colonna sola nell'ordine del DOM: dati personali, password, preferenze, storico */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <PersonalDetailsCard user={user} />
          <PasswordCard email={user.email} />
        </div>
        <div className="grid min-w-0 gap-6">
          <PreferencesCard />
          {/* Tappe dell'account sotto le preferenze (spec SP2 fase 1 §8.4) */}
          <HistoryCard />
        </div>
      </div>
    </>
  )
}

export default ProfilePage
