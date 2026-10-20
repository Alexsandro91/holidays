import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigationType } from 'react-router'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useBalanceOverview, type BalanceOverviewRow } from '@/features/balances/api'
import AlignBalancesDialog from '@/features/balances/components/AlignBalancesDialog'
import BalancesFilters from '@/features/balances/components/BalancesFilters'
import BalancesTable from '@/features/balances/components/BalancesTable'
import RowAdjustDialog from '@/features/balances/components/RowAdjustDialog'
import UserBalancesDialog from '@/features/balances/components/UserBalancesDialog'
import { useBalanceListParams } from '@/features/balances/useBalanceListParams'
import { useCurrentUser, useMultipleLocations } from '@/features/auth/api'

interface Target {
  id: number
  name: string
  locationId?: number
  locationName?: string
}

const toTarget = (row: BalanceOverviewRow): Target => ({ id: row.user.id, name: row.user.name, locationId: row.user.location?.id, locationName: row.user.location?.name })

/** Pagina Saldi (responsabili e admin): tabella con barre, filtri nell'URL e azioni di riga (spec SP2 fase 2 §7.2). */
const BalancesPage = () => {
  const { t, i18n } = useTranslation()
  const { data: currentUser } = useCurrentUser()
  const multipleLocations = useMultipleLocations()
  // Filtro e ordinamento per sede solo per l'admin con più sedi
  const withLocation = currentUser?.role === 'admin' && multipleLocations
  const { params, setParams } = useBalanceListParams(withLocation)
  const title = currentUser?.role === 'manager' && multipleLocations ? t('balances.titleWithLocation', { location: currentUser.location.name }) : t('balances.title')
  // Indietro e Avanti riportano il campo di ricerca al valore dell'URL, scartando il testo in debounce
  const location = useLocation()
  const navigationType = useNavigationType()
  const [resetKey, setResetKey] = useState(0)
  const [seenKey, setSeenKey] = useState(location.key)
  if (seenKey !== location.key) {
    setSeenKey(location.key)
    if (navigationType === 'POP') setResetKey(resetKey + 1)
  }
  const [opened, setOpened] = useState<Target | null>(null)
  // La persona resta dopo la chiusura: il dialog finisce la sua animazione e riporta il focus
  const [alignTarget, setAlignTarget] = useState<Target | null>(null)
  const [aligning, setAligning] = useState(false)
  const [adjusting, setAdjusting] = useState<Target | null>(null)

  const overview = useBalanceOverview({ search: params.search, onlyNegative: params.onlyNegative, locationId: params.location, sort: params.sort, page: params.page })

  // Pagina oltre l'ultima (es. dopo un filtro): si torna all'ultima disponibile
  const currentPage = overview.data?.meta.current_page
  const lastPage = overview.data?.meta.last_page
  useEffect(() => {
    if (currentPage !== undefined && lastPage !== undefined && lastPage >= 1 && currentPage > lastPage) setParams({ page: lastPage }, { replace: true })
  }, [currentPage, lastPage, setParams])

  const filtered = params.search !== '' || params.onlyNegative || params.location !== null
  const clearFilters = () => {
    setResetKey((key) => key + 1)
    setParams({ search: '', onlyNegative: false, location: null, page: 1 })
    // Il pulsante sparisce senza filtri: il focus va alla ricerca, sempre visibile
    document.getElementById('balances-search')?.focus()
  }

  const onAction = (row: BalanceOverviewRow, action: 'open' | 'align' | 'adjust') => {
    const target = toTarget(row)
    if (action === 'open') setOpened(target)
    else if (action === 'align') {
      setAlignTarget(target)
      setAligning(true)
    }
    else setAdjusting(target)
  }

  const today = new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())
  // Esito della vista per chi usa uno screen reader: annunciato quando arrivano i dati nuovi, non con quelli precedenti
  const result = overview.data === undefined || overview.isPlaceholderData ? '' : overview.data.meta.total === 0 ? t('balances.page.empty') : t('balances.page.total', { count: overview.data.meta.total })

  return (
    <>
      <PageHeading title={title} description={t('balances.page.subtitle', { date: today })} />
      <BalancesFilters params={params} setParams={setParams} withLocation={withLocation} resetKey={resetKey} />
      {/* Live region stabile: montata sempre, fuori dai rami di caricamento, errore e lista vuota */}
      <p role="status" className="sr-only">
        {result}
      </p>
      {overview.isPending ? (
        <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-16 w-full" />
          ))}
        </div>
      ) : overview.isError ? (
        <div role="alert" className="grid justify-items-start gap-3 rounded-lg border p-6">
          <p>{t('balances.page.loadError')}</p>
          <Button variant="outline" onClick={() => void overview.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : overview.data.data.length === 0 ? (
        <div className="grid justify-items-start gap-3 rounded-lg border p-6">
          <p>{t('balances.page.empty')}</p>
          {filtered && (
            <Button variant="outline" onClick={clearFilters}>
              {t('balances.page.showAll')}
            </Button>
          )}
        </div>
      ) : (
        // Durante il caricamento della vista nuova restano i dati precedenti (keepPreviousData)
        <div aria-busy={overview.isPlaceholderData || undefined}>
          <BalancesTable
            rows={overview.data.data}
            sort={params.sort}
            page={params.page}
            lastPage={overview.data.meta.last_page}
            total={overview.data.meta.total}
            withLocation={withLocation}
            onSort={(sort) => setParams({ sort, page: 1 })}
            onPage={(page) => setParams({ page })}
            onAction={onAction}
          />
        </div>
      )}
      <UserBalancesDialog userId={opened?.id ?? null} userName={opened?.name ?? ''} locationId={opened?.locationId} locationName={opened?.locationName} onClose={() => setOpened(null)} />
      {alignTarget !== null && <AlignBalancesDialog userId={alignTarget.id} userName={alignTarget.name} open={aligning} onClose={() => setAligning(false)} returnFocusToUser={alignTarget.id} />}
      <RowAdjustDialog target={adjusting} onClose={() => setAdjusting(null)} />
    </>
  )
}

export default BalancesPage
