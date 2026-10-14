import { useTranslation } from 'react-i18next'
import PageHeading from '@/components/layout/PageHeading'
import { useCurrentUser } from '@/features/auth/api'
import PasswordCard from '@/features/profile/components/PasswordCard'
import PersonalDetailsCard from '@/features/profile/components/PersonalDetailsCard'
import PreferencesCard from '@/features/profile/components/PreferencesCard'

/** Profilo di chi è collegato, per ogni ruolo: dati personali, password e preferenze (spec fase 4 §3.2). */
const ProfilePage = () => {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()

  // ProtectedRoute garantisce l'utente: questo ramo copre solo l'istante del logout
  if (!user) return null

  return (
    // Larghezza di lettura, come la home: sul telefono i blocchi restano in colonna
    <div className="grid max-w-3xl gap-6">
      <PageHeading title={t('profile.title')} description={t('profile.description')} />
      <PersonalDetailsCard user={user} />
      <PasswordCard />
      <PreferencesCard />
    </div>
  )
}

export default ProfilePage
