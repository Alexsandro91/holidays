import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLocations, type Location, type LocationSort, type LocationStatus } from '@/features/locations/api'
import LocationActionsMenu, { type LocationAction } from '@/features/locations/components/LocationActionsMenu'
import LocationConfirmDialog from '@/features/locations/components/LocationConfirmDialog'
import LocationFormDialog from '@/features/locations/components/LocationFormDialog'
import LocationsTable from '@/features/locations/components/LocationsTable'

const STATUSES: LocationStatus[] = ['active', 'archived']

const isStatus = (value: string): value is LocationStatus => STATUSES.some((status) => status === value)

const toPage = (value: string | null): number => {
  const page = Number.parseInt(value ?? '', 10)
  return Number.isNaN(page) || page < 1 ? 1 : page
}

/** Sezione Sedi (solo admin, spec SP2 fase 1 §5.2): schede Attive e Archiviate, stato e ordinamento nell'URL. */
const LocationsPage = () => {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status') ?? ''
  const status: LocationStatus = isStatus(statusParam) ? statusParam : 'active'
  const sort: LocationSort = searchParams.get('sort') === '-name' ? '-name' : 'name'
  const page = toPage(searchParams.get('page'))
  const locations = useLocations({ status, sort, page })
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<{ location: Location; action: LocationAction } | null>(null)

  // Scrive solo i valori diversi dal default, come la lista utenti
  const update = (next: { status?: LocationStatus; sort?: LocationSort; page?: number }) =>
    setSearchParams((current) => {
      const merged = { status, sort, page, ...next }
      const query = new URLSearchParams(current)
      query.delete('status')
      query.delete('sort')
      query.delete('page')
      if (merged.status !== 'active') query.set('status', merged.status)
      if (merged.sort !== 'name') query.set('sort', merged.sort)
      if (merged.page > 1) query.set('page', String(merged.page))
      return query
    })

  // Stabile: la tabella non ricrea i menu a ogni render
  const renderActions = useCallback((location: Location) => <LocationActionsMenu location={location} onSelect={(action) => setConfirm({ location, action })} />, [])

  const lastPage = locations.data?.meta.last_page ?? 1

  return (
    <>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <PageHeading title={t('locations.title')} description={t('locations.subtitle')} className="mb-0" />
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden="true" />
          {t('locations.add')}
        </Button>
      </div>
      <Tabs value={status} onValueChange={(next) => isStatus(next) && update({ status: next, page: 1 })}>
        <TabsList aria-label={t('locations.tabs.label')}>
          {STATUSES.map((item) => (
            <TabsTrigger key={item} value={item} className="h-7 flex-none gap-1.5 text-muted-foreground">
              {t(`locations.tabs.${item}`)}
              {locations.data !== undefined && (
                <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{locations.data.meta.counts[item]}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={status}>
          {locations.isPending ? (
            <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-14 w-full" />
              ))}
            </div>
          ) : locations.isError ? (
            <div role="alert" className="grid justify-items-start gap-3 rounded-lg border p-6">
              <p>{t('locations.loadError')}</p>
              <Button variant="outline" onClick={() => void locations.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : locations.data.data.length === 0 ? (
            <p className="rounded-lg border p-6">{t(`locations.empty.${status}`)}</p>
          ) : (
            <div aria-busy={locations.isPlaceholderData || undefined}>
              <LocationsTable locations={locations.data.data} sort={sort} onSortChange={(next) => update({ sort: next, page: 1 })} renderActions={renderActions} />
              {lastPage > 1 && (
                <nav aria-label={t('locations.pagination.label')} className="mt-4 flex items-center justify-end gap-1">
                  <p aria-live="polite" className="mr-2 text-sm">
                    {t('locations.pagination.status', { page, pages: lastPage })}
                  </p>
                  <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => update({ page: page - 1 })} aria-label={t('locations.pagination.previous')}>
                    <ChevronLeft aria-hidden="true" />
                  </Button>
                  <Button variant="outline" size="icon" disabled={page >= lastPage} onClick={() => update({ page: page + 1 })} aria-label={t('locations.pagination.next')}>
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </nav>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
      <LocationFormDialog open={creating} location={null} onClose={() => setCreating(false)} />
      <LocationConfirmDialog location={confirm?.location ?? null} action={confirm?.action ?? null} onClose={() => setConfirm(null)} />
    </>
  )
}

export default LocationsPage
