import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { balanceTypeSchema, type BalanceMovement, type BalanceSummary, type BalanceType } from '@/features/balances/api'
import BalanceMovementsList from '@/features/balances/components/BalanceMovementsList'
import LoadMore from '@/features/history/components/LoadMore'

/** Quello che serve di una query infinita di movimenti (di una persona o del profilo). */
interface MovementsQuery {
  isPending: boolean
  isError: boolean
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isFetchNextPageError: boolean
  refetch: () => unknown
  fetchNextPage: () => unknown
}

interface BalanceMovementsSectionProps {
  balances: BalanceSummary['balances']
  filter: BalanceType | 'all'
  onFilterChange: (filter: BalanceType | 'all') => void
  query: MovementsQuery
  items: BalanceMovement[]
  /** Nome di chi ha agito: solo nella vista di admin e responsabili */
  showActor: boolean
  /** Livello del titolo: 3 dentro il dialog, 2 in una pagina dove segue il titolo di pagina */
  headingLevel?: 2 | 3
}

/** Movimenti con filtro per saldo, errore in linea e "Carica altre". */
const BalanceMovementsSection = ({ balances, filter, onFilterChange, query, items, showActor, headingLevel = 3 }: BalanceMovementsSectionProps) => {
  const { t } = useTranslation()
  const Heading = headingLevel === 2 ? 'h2' : 'h3'

  const body = () => {
    if (query.isPending) return <Skeleton className="h-10 w-full" />
    if (query.isError && items.length === 0) {
      return (
        <div role="alert" className="grid justify-items-start gap-2">
          <p>{t('balances.dialog.movementsLoadError')}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )
    }
    if (items.length === 0) return <p className="text-muted-foreground">{t('balances.dialog.noMovements')}</p>
    return <BalanceMovementsList movements={items} showActor={showActor} />
  }

  return (
    <section aria-labelledby="balances-movements-title" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Heading id="balances-movements-title" className="font-heading text-base font-semibold">
          {t('balances.dialog.movements')}
        </Heading>
        <div className="grid gap-1">
          <Label htmlFor="balances-filter">{t('balances.dialog.balanceFilter')}</Label>
          <Select
            value={filter}
            onValueChange={(next) => {
              const parsed = balanceTypeSchema.safeParse(next)
              onFilterChange(parsed.success ? parsed.data : 'all')
            }}
          >
            <SelectTrigger id="balances-filter" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">{t('balances.dialog.allBalances')}</SelectItem>
              {balances.map((item) => (
                <SelectItem key={item.balance} value={item.balance}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {body()}
      {query.hasNextPage && (
        <LoadMore
          pending={query.isFetchingNextPage}
          failed={query.isFetchNextPageError}
          onLoad={() => void query.fetchNextPage()}
          labels={{ loadMore: t('balances.dialog.loadMore'), error: t('balances.dialog.loadMoreError') }}
        />
      )}
    </section>
  )
}

export default BalanceMovementsSection
