import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCompanyAccrual, useLocationAccrual, useUpdateLocationAccrual, type AccrualValuesInput } from '@/features/balances/api'
import AccrualValuesForm from '@/features/balances/components/AccrualValuesForm'
import type { LocationDetail } from '@/features/locations/api'
import ProfileCard from '@/features/profile/components/ProfileCard'
import { isApiError } from '@/lib/api'

interface LocationAccrualCardProps {
  location: LocationDetail
}

/** Maturazione annua della sede (spec SP2 fase 2 §7.8): per ogni saldo "Come l'azienda" oppure un valore della sede. */
const LocationAccrualCard = ({ location }: LocationAccrualCardProps) => {
  const { t } = useTranslation()
  const company = useCompanyAccrual()
  const accrual = useLocationAccrual(location.id)
  const update = useUpdateLocationAccrual(location.id)

  const save = async (values: AccrualValuesInput) => {
    try {
      await update.mutateAsync(values)
      toast.success(t('accrual.saved'))
    } catch (error) {
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    }
  }

  const failed = company.isError || accrual.isError
  const retry = () => {
    void company.refetch()
    void accrual.refetch()
  }

  return (
    <ProfileCard titleId="location-accrual-title" title={t('accrual.title')} description={t('locations.detail.accrualDescription')}>
      {failed ? (
        <div role="alert" className="grid justify-items-start gap-3">
          <p>{t('accrual.loadError')}</p>
          <Button variant="outline" onClick={retry}>
            {t('common.retry')}
          </Button>
        </div>
      ) : company.data === undefined || accrual.data === undefined ? (
        <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        // Il valore ereditato è quello dell'azienda, anche quando la sede ne ha uno proprio; rimontato dopo il salvataggio
        <AccrualValuesForm
          key={JSON.stringify(accrual.data.values)}
          values={accrual.data.values}
          effective={company.data.effective}
          inheritable
          inheritFrom="company"
          onSubmit={(values) => void save(values)}
          pending={update.isPending}
        />
      )}
    </ProfileCard>
  )
}

export default LocationAccrualCard
