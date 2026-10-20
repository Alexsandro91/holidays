import { useTranslation } from 'react-i18next'
import { Progress } from '@/components/ui/progress'
import { formatHours } from '@/features/balances/hoursFormat'
import { cn } from '@/lib/utils'

interface BalanceBarProps {
  label: string
  currentMinutes: number
  annualMinutes: number
}

/** Barra del saldo sul valore annuo (0-100%): rossa se il saldo è negativo, assente se il valore annuo è 0. */
const BalanceBar = ({ label, currentMinutes, annualMinutes }: BalanceBarProps) => {
  const { t, i18n } = useTranslation()
  if (annualMinutes <= 0) return null

  const negative = currentMinutes < 0
  const value = Math.min(100, Math.max(0, Math.round((currentMinutes / annualMinutes) * 100)))

  return (
    <Progress
      value={value}
      aria-label={t('balances.page.bar', { label, current: formatHours(currentMinutes, i18n.language), annual: formatHours(annualMinutes, i18n.language) })}
      data-variant={negative ? 'error' : 'default'}
      className={cn('h-1.5', negative && 'bg-destructive/25')}
      indicatorClassName={negative ? 'bg-destructive' : undefined}
    />
  )
}

export default BalanceBar
