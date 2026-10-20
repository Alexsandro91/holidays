import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfileAbsenceTypes } from '@/features/absenceTypes/api'
import { useProfileBalanceMovements, useProfileBalances, type BalanceType } from '@/features/balances/api'
import BalanceCards from '@/features/balances/components/BalanceCards'
import BalanceMovementsSection from '@/features/balances/components/BalanceMovementsSection'
import BalanceYearSelect from '@/features/balances/components/BalanceYearSelect'
import { formatNumericDate } from '@/features/balances/describeMovement'
import { formatHours } from '@/features/balances/hoursFormat'

/** Tipi di assenza che valgono per chi è collegato. */
const UsableTypes = () => {
  const { t } = useTranslation()
  const types = useProfileAbsenceTypes()

  const body = () => {
    if (types.isPending) return <Skeleton className="h-10 w-full" />
    if (types.isError) {
      return (
        <div role="alert" className="grid justify-items-start gap-2">
          <p>{t('leave.types.loadError')}</p>
          <Button variant="outline" onClick={() => void types.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )
    }
    if (types.data.length === 0) return <p className="text-muted-foreground">{t('leave.types.empty')}</p>
    return (
      <ul aria-label={t('leave.types.title')} className="flex flex-wrap gap-2">
        {types.data.map((type) => (
          <li key={type.id} className="rounded-md border border-border px-3 py-1.5 text-sm">
            {type.name}
            {type.requires_enablement && <span className="ml-2 text-muted-foreground">({t('leave.types.enablement')})</span>}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section aria-labelledby="leave-types-title" className="grid gap-3">
      <h2 id="leave-types-title" className="font-heading text-base font-semibold">
        {t('leave.types.title')}
      </h2>
      {body()}
    </section>
  )
}

/** Scheda dei propri saldi: come quella di admin e responsabili, ma senza pulsanti, autore dei movimenti e valori annui. */
const OwnBalances = () => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const [year, setYear] = useState(new Date().getFullYear())
  const [balanceFilter, setBalanceFilter] = useState<BalanceType | 'all'>('all')
  const summary = useProfileBalances(year)
  const movements = useProfileBalanceMovements(balanceFilter === 'all' ? { year } : { year, balance: balanceFilter })
  const items = movements.data?.pages.flatMap((page) => page.data) ?? []

  if (summary.data === undefined && summary.isPending) {
    return (
      <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (summary.data === undefined) {
    return (
      <div role="alert" className="grid justify-items-start gap-2">
        <p>{t('leave.loadError')}</p>
        <Button variant="outline" onClick={() => void summary.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  const data = summary.data
  if (!data.applicable) return <p className="text-muted-foreground">{t('leave.notApplicable')}</p>

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-0.5 text-sm text-muted-foreground">
          <span>{t('balances.dialog.weekly', { hours: formatHours(data.weekly_minutes, locale) })}</span>
          {data.last_aligned_on !== null && <span>{t('balances.dialog.lastAligned', { date: formatNumericDate(data.last_aligned_on, locale) })}</span>}
        </div>
        <BalanceYearSelect year={year} onChange={setYear} />
      </div>
      <BalanceCards summary={data} />
      <BalanceMovementsSection balances={data.balances} filter={balanceFilter} onFilterChange={setBalanceFilter} query={movements} items={items} showActor={false} headingLevel={2} />
    </div>
  )
}

/** Saldi e tipi di assenza di chi è collegato, per ogni ruolo (spec SP2 fase 3 §7.1): il corpo della Home. */
const MyBalancesSection = () => (
  <div className="grid gap-8">
    <OwnBalances />
    <UsableTypes />
  </div>
)

export default MyBalancesSection
