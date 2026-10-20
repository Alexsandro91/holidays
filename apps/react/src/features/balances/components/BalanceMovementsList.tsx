import { useTranslation } from 'react-i18next'
import type { BalanceMovement } from '@/features/balances/api'
import { describeMovement } from '@/features/balances/describeMovement'
import { formatHours } from '@/features/balances/hoursFormat'
import { formatDay } from '@/features/locations/dateFormat'
import { cn } from '@/lib/utils'

interface BalanceMovementsListProps {
  movements: BalanceMovement[]
  /** Nome di chi ha agito: solo nella vista di admin e responsabili */
  showActor: boolean
}

/** Movimenti dal più recente: data, saldo toccato, descrizione, autore e ore con segno. */
const BalanceMovementsList = ({ movements, showActor }: BalanceMovementsListProps) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language

  return (
    <ul aria-label={t('balances.dialog.movements')} className="grid gap-3">
      {movements.map((movement) => {
        const hours = formatHours(movement.minutes, locale)
        return (
          <li key={movement.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-l-2 border-border pl-3">
            <span className="text-sm text-muted-foreground">
              {formatDay(movement.effective_on, locale, { dateStyle: 'medium' })} · {t(`accrual.balances.${movement.balance}`)}
            </span>
            <span className={cn('row-span-2 self-center text-right font-medium tabular-nums', movement.minutes < 0 && 'text-destructive')}>
              {t('balances.hours', { hours: movement.minutes > 0 ? `+${hours}` : hours })}
            </span>
            <span>{describeMovement(movement, t, locale)}</span>
            {showActor && movement.actor_name !== null && (
              <span className="col-start-1 text-sm text-muted-foreground">{t('balances.movement.by', { name: movement.actor_name })}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default BalanceMovementsList
