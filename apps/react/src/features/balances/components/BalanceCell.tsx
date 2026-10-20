import { useTranslation } from 'react-i18next'
import BalanceBar from '@/features/balances/components/BalanceBar'
import { formatDays, formatHours } from '@/features/balances/hoursFormat'
import { cn } from '@/lib/utils'

interface BalanceCellProps {
  label: string
  currentMinutes: number
  annualMinutes: number
  /** Giorni equivalenti sull'orario medio: solo per le ferie */
  averageDayMinutes?: number
}

/** Saldo in ore (e giorni per le ferie) con la barra sul valore annuo. */
const BalanceCell = ({ label, currentMinutes, annualMinutes, averageDayMinutes }: BalanceCellProps) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const days = averageDayMinutes === undefined ? null : formatDays(currentMinutes, averageDayMinutes, locale)

  return (
    <div className="grid min-w-28 gap-1.5">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className={cn('font-semibold tabular-nums', currentMinutes < 0 && 'text-destructive')}>{t('balances.hours', { hours: formatHours(currentMinutes, locale) })}</span>
        {days !== null && <span className="text-sm text-muted-foreground">{t('balances.cards.days', { days })}</span>}
      </p>
      <BalanceBar label={label} currentMinutes={currentMinutes} annualMinutes={annualMinutes} />
    </div>
  )
}

export default BalanceCell
