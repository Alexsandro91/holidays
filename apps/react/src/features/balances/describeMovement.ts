import type { TFunction } from 'i18next'
import type { BalanceMovement } from '@/features/balances/api'
import { formatHours } from '@/features/balances/hoursFormat'
import { formatDay, formatDayRange } from '@/features/locations/dateFormat'

/** Data della busta paga come "30/09/2026" (nella lingua dell'interfaccia). */
export const formatNumericDate = (date: string, locale: string): string => formatDay(date, locale, { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Descrizione di un movimento, composta da quello che il server restituisce con il formato delle ore della lingua. */
export const describeMovement = (movement: BalanceMovement, t: TFunction, locale: string): string => {
  const { kind, period, effective_on: effectiveOn, target_minutes: target, minutes, note } = movement
  const trimmed = note?.trim() ?? ''

  if (kind === 'accrual') {
    // Il periodo è "AAAA-MM"; senza, vale la data di effetto
    const month = formatDay(period === null ? effectiveOn : `${period}-01`, locale, { month: 'long', year: 'numeric' })
    return t('balances.movement.accrual', { period: month })
  }

  if (kind === 'alignment') {
    const date = formatNumericDate(effectiveOn, locale)
    if (target === null) return t('balances.movement.alignmentNoTarget', { date })
    // Il valore prima dell'allineamento è quello di arrivo meno la differenza registrata
    return t('balances.movement.alignment', { date, from: formatHours(target - minutes, locale), to: formatHours(target, locale) })
  }

  if (kind === 'adjustment') return trimmed === '' ? t('balances.movement.adjustmentNoNote') : t('balances.movement.adjustment', { note: trimmed })

  // Il movimento di una richiesta: tipo e date; un importo positivo restituisce ore già scalate
  const leave = movement.leave_request
  if (leave !== null && leave.absence_type_name !== null) {
    return t(minutes > 0 ? 'balances.movement.usageRefund' : 'balances.movement.usageLeave', {
      type: leave.absence_type_name,
      dates: formatDayRange(leave.starts_on, leave.ends_on, locale),
    })
  }

  return trimmed === '' ? t('balances.movement.usage') : t('balances.movement.usageNote', { note: trimmed })
}
