import { ArrowDown, ArrowUp } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Location, LocationSort } from '@/features/locations/api'
import LocationBadge from '@/features/locations/components/LocationBadge'

interface LocationsTableProps {
  locations: Location[]
  sort: LocationSort
  onSortChange: (sort: LocationSort) => void
  renderActions: (location: Location) => ReactNode
}

/** Badge di una sede: principale, archiviata e, per una sede attiva senza responsabili, l'avviso. */
const badges = (location: Location): ReactNode => (
  <>
    {location.is_primary && <LocationBadge kind="primary" />}
    {location.archived_at !== null && <LocationBadge kind="archived" />}
    {location.archived_at === null && location.managers_count === 0 && <LocationBadge kind="noManager" />}
  </>
)

/** Tabella su desktop, schede su mobile: le due viste sono nel DOM e si alternano via CSS, come la lista utenti. */
const LocationsTable = ({ locations, sort, onSortChange, renderActions }: LocationsTableProps) => {
  const { t } = useTranslation()
  const descending = sort === '-name'
  const SortIcon = descending ? ArrowDown : ArrowUp

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableCaption className="sr-only">{t('locations.title')}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead aria-sort={descending ? 'descending' : 'ascending'}>
                <Button variant="ghost" size="sm" className="-ml-3 font-medium text-foreground" onClick={() => onSortChange(descending ? 'name' : '-name')}>
                  {t('locations.columns.name')}
                  <SortIcon aria-hidden="true" />
                </Button>
              </TableHead>
              <TableHead>{t('locations.columns.city')}</TableHead>
              <TableHead>{t('locations.columns.people')}</TableHead>
              <TableHead>{t('locations.columns.managers')}</TableHead>
              <TableHead>
                <span className="sr-only">{t('locations.columns.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {locations.map((location) => (
              <TableRow key={location.id}>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-2">
                    <Link to={`/admin/locations/${location.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {location.name}
                    </Link>
                    {badges(location)}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{location.city ?? ''}</TableCell>
                <TableCell className="tabular-nums">{location.users_count}</TableCell>
                <TableCell className="tabular-nums">{location.managers_count}</TableCell>
                <TableCell className="text-right">{renderActions(location)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid gap-3 md:hidden">
        {locations.map((location) => (
          <li key={location.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg border p-4">
            <div className="grid gap-2">
              <Link to={`/admin/locations/${location.id}`} className="font-semibold underline-offset-4 hover:underline">
                {location.name}
              </Link>
              {location.city && <span className="text-sm text-muted-foreground">{location.city}</span>}
              <span className="text-sm">
                {t('locations.people', { count: location.users_count })} · {t('locations.managers', { count: location.managers_count })}
              </span>
              <div className="flex flex-wrap items-center gap-2">{badges(location)}</div>
            </div>
            <div className="-mt-2 -mr-2">{renderActions(location)}</div>
          </li>
        ))}
      </ul>
    </>
  )
}

export default LocationsTable
