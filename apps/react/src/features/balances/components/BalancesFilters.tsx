import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import LocationFilter from '@/features/users/components/LocationFilter'
import TextFilter from '@/features/users/components/TextFilter'
import type { BalanceListParams } from '@/features/balances/useBalanceListParams'

interface BalancesFiltersProps {
  params: BalanceListParams
  setParams: (next: Partial<BalanceListParams>, options?: { replace?: boolean }) => void
  /** Filtro per sede: solo admin con più sedi */
  withLocation: boolean
}

/** Ricerca per nome, Sede (solo admin con più sedi) e "Solo saldi negativi"; lo stato è nell'URL. */
const BalancesFilters = ({ params, setParams, withLocation }: BalancesFiltersProps) => {
  const { t } = useTranslation()

  return (
    <div role="search" aria-label={t('balances.page.filters.label')} className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">
      <TextFilter
        id="balances-search"
        label={t('balances.page.filters.search')}
        placeholder={t('balances.page.filters.searchPlaceholder')}
        value={params.search}
        // I testi aggiornano l'URL con replace: ogni battuta non diventa una voce della cronologia
        onCommit={(search) => setParams({ search, page: 1 }, { replace: true })}
        onDraft={() => undefined}
        resetKey={0}
        className="min-w-0 flex-1 basis-60 sm:max-w-md"
      />
      {withLocation && (
        <div className="w-full sm:w-56">
          <LocationFilter value={params.location} onChange={(location) => setParams({ location, page: 1 })} />
        </div>
      )}
      <div className="flex items-center gap-2 pb-2">
        <Checkbox id="balances-negative" checked={params.onlyNegative} onCheckedChange={(checked) => setParams({ onlyNegative: checked === true, page: 1 })} />
        <Label htmlFor="balances-negative" className="font-normal">
          {t('balances.page.filters.negative')}
        </Label>
      </div>
    </div>
  )
}

export default BalancesFilters
