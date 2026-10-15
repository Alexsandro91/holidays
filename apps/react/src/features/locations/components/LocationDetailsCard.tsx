import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { LocationDetail } from '@/features/locations/api'
import LocationFormDialog from '@/features/locations/components/LocationFormDialog'
import { formatPatron } from '@/features/locations/patron'
import ProfileCard from '@/features/profile/components/ProfileCard'

interface LocationDetailsCardProps {
  location: LocationDetail
}

/** Nome, città e patrono con Modifica. Paese e fuso non compaiono finché c'è solo l'Italia (spec §5.3). */
const LocationDetailsCard = ({ location }: LocationDetailsCardProps) => {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const patron = formatPatron(location.patron_day, location.patron_month)
  const rows: [string, string][] = [
    [t('locations.detail.name'), location.name],
    [t('locations.detail.city'), location.city ?? t('locations.detail.noCity')],
    [t('locations.detail.patron'), patron === '' ? t('locations.detail.noPatron') : patron],
  ]

  return (
    <ProfileCard
      titleId="location-data-title"
      title={t('locations.detail.dataTitle')}
      footer={
        <Button variant="outline" className="w-full sm:w-auto" onClick={() => setEditing(true)}>
          {t('locations.detail.edit')}
        </Button>
      }
    >
      <dl className="grid gap-3 sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-0.5">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="font-medium break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <LocationFormDialog open={editing} location={location} onClose={() => setEditing(false)} />
    </ProfileCard>
  )
}

export default LocationDetailsCard
