import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocation } from '@/features/locations/api'
import ClosuresCard from '@/features/locations/components/ClosuresCard'
import LocationAccrualCard from '@/features/locations/components/LocationAccrualCard'
import LocationBadge from '@/features/locations/components/LocationBadge'
import LocationCalendarCard from '@/features/locations/components/LocationCalendarCard'
import LocationDetailsCard from '@/features/locations/components/LocationDetailsCard'
import LocationScheduleCard from '@/features/locations/components/LocationScheduleCard'
import { isApiError } from '@/lib/api'

const BackLink = () => {
  const { t } = useTranslation()
  return (
    <Link to="/admin/locations" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
      <ChevronLeft className="size-4" aria-hidden="true" />
      {t('locations.detail.back')}
    </Link>
  )
}

/** Dettaglio di una sede (spec SP2 fase 1 §5.3): dati, orario standard e chiusure a sinistra, calendario dell'anno a destra. */
const LocationDetailPage = () => {
  const { t } = useTranslation()
  const params = useParams()
  const location = useLocation(Number(params.id))

  if (location.isPending) {
    return (
      <div className="grid gap-4" role="status" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (location.isError) {
    const notFound = isApiError(location.error) && location.error.status === 404
    return (
      <>
        <BackLink />
        <div role="alert" className="grid justify-items-start gap-3 rounded-lg border p-6">
          <p>{notFound ? t('locations.detail.notFound') : t('locations.detail.loadError')}</p>
          {!notFound && (
            <Button variant="outline" onClick={() => void location.refetch()}>
              {t('common.retry')}
            </Button>
          )}
        </div>
      </>
    )
  }

  const data = location.data

  return (
    <>
      <BackLink />
      <PageHeading
        title={data.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {data.city}
            {data.is_primary && <LocationBadge kind="primary" />}
            {data.archived_at !== null && <LocationBadge kind="archived" />}
            {data.archived_at === null && data.managers_count === 0 && <LocationBadge kind="noManager" />}
          </span>
        }
      />
      {/* Da lg due colonne: dati, orario e chiusure a sinistra, calendario a destra. Sotto lg una colonna nell'ordine del DOM */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <div className="grid min-w-0 gap-6">
          <LocationDetailsCard location={data} />
          <LocationScheduleCard location={data} />
          <LocationAccrualCard location={data} />
          <ClosuresCard location={data} />
        </div>
        <div className="min-w-0">
          <LocationCalendarCard location={data} />
        </div>
      </div>
    </>
  )
}

export default LocationDetailPage
