import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLocationOptions } from '@/features/locations/api'

interface LocationFilterProps {
  value: number | null
  onChange: (location: number | null) => void
}

/** Select della sede (solo admin con più sedi, spec §5.4): "Tutte le sedi" toglie il filtro. */
const LocationFilter = ({ value, onChange }: LocationFilterProps) => {
  const { t } = useTranslation()
  const options = useLocationOptions()
  return (
    <div className="grid gap-2">
      <Label id="users-filter-location-label" htmlFor="users-filter-location">
        {t('users.filters.location')}
      </Label>
      <Select value={value === null ? 'all' : String(value)} onValueChange={(next) => onChange(next === 'all' ? null : Number(next))}>
        <SelectTrigger id="users-filter-location" aria-labelledby="users-filter-location-label" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectItem value="all">{t('users.filters.allLocations')}</SelectItem>
          {(options.data ?? []).map((location) => (
            <SelectItem key={location.id} value={String(location.id)}>
              {location.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default LocationFilter
