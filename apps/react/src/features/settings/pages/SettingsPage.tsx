import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCompanyAccrual, useUpdateCompanyAccrual, type AccrualValuesInput } from '@/features/balances/api'
import AccrualValuesForm from '@/features/balances/components/AccrualValuesForm'
import ProfileCard from '@/features/profile/components/ProfileCard'
import { isApiError } from '@/lib/api'

/** Impostazioni dell'azienda (solo admin, spec SP2 fase 2 §7.8): valori annui di maturazione per un tempo pieno. */
const SettingsPage = () => {
  const { t } = useTranslation()
  const accrual = useCompanyAccrual()
  const update = useUpdateCompanyAccrual()

  const save = async (values: AccrualValuesInput) => {
    try {
      await update.mutateAsync(values)
      toast.success(t('accrual.saved'))
    } catch (error) {
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    }
  }

  return (
    <>
      <PageHeading title={t('settings.title')} description={t('settings.description')} />
      <div className="max-w-2xl">
        <ProfileCard titleId="settings-accrual-title" title={t('accrual.title')} description={t('settings.accrualDescription')}>
          {accrual.isPending ? (
            <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : accrual.isError ? (
            <div role="alert" className="grid justify-items-start gap-3">
              <p>{t('accrual.loadError')}</p>
              <Button variant="outline" onClick={() => void accrual.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : (
            // Rimontato quando i valori del server cambiano (dopo il salvataggio): il form riparte dai dati salvati
            <AccrualValuesForm
              key={JSON.stringify(accrual.data.values)}
              values={accrual.data.values}
              effective={accrual.data.effective}
              inheritable={false}
              onSubmit={(values) => void save(values)}
              pending={update.isPending}
            />
          )}
        </ProfileCard>
      </div>
    </>
  )
}

export default SettingsPage
