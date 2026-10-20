import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { BalanceSummary } from '@/features/balances/api'
import { formatDays, formatHours } from '@/features/balances/hoursFormat'
import { cn } from '@/lib/utils'

interface BalanceCardsProps {
  summary: BalanceSummary
}

/** Un riquadro per saldo (ferie, ROL, ex festività): saldo, giorni per le ferie e riepilogo dell'anno (spec SP2 fase 2 §5.3). */
const BalanceCards = ({ summary }: BalanceCardsProps) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const hours = (minutes: number) => t('balances.hours', { hours: formatHours(minutes, locale) })

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {summary.balances.map((balance) => {
        // I giorni equivalenti valgono solo per le ferie
        const days = balance.balance === 'vacation' ? formatDays(balance.current_minutes, summary.average_day_minutes, locale) : null
        const rows: [string, number][] = [
          [t('balances.cards.opening'), balance.summary.opening],
          [t('balances.cards.accrued'), balance.summary.accrued],
          [t('balances.cards.used'), balance.summary.used],
          [t('balances.cards.corrections'), balance.summary.corrections],
        ]
        return (
          <Card key={balance.balance} size="sm" role="region" aria-label={balance.label}>
            <CardHeader>
              <CardTitle>{balance.label}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div>
                <p className={cn('text-2xl font-semibold tabular-nums', balance.current_minutes < 0 && 'text-destructive')}>{hours(balance.current_minutes)}</p>
                {days !== null && <p className="text-sm text-muted-foreground">{t('balances.cards.days', { days })}</p>}
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
                {rows.map(([label, minutes]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right tabular-nums">{hours(minutes)}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

export default BalanceCards
