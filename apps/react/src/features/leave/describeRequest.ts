import type { TFunction } from 'i18next'
import { z } from 'zod'
import { formatHours } from '@/features/balances/hoursFormat'
import type { LeaveRequest, LeaveWarning } from '@/features/leave/api'
import { formatDayRange } from '@/features/locations/dateFormat'

type RequestPeriod = Pick<LeaveRequest, 'starts_on' | 'ends_on' | 'unit' | 'half' | 'starts_at' | 'ends_at'>

/** Giorni lavorativi con al massimo 2 decimali, nella lingua dell'interfaccia (0,5). */
export const formatWorkingDays = (days: number, language: string): string => new Intl.NumberFormat(language, { maximumFractionDigits: 2, useGrouping: false }).format(days)

/** Quando: "26–30 ottobre 2026", "26 ottobre 2026, mattina", "26 ottobre 2026, dalle 09:00 alle 11:30". */
export const describePeriod = (request: RequestPeriod, t: TFunction, language: string): string => {
  const dates = formatDayRange(request.starts_on, request.ends_on, language)
  if (request.unit === 'half_day' && request.half !== null) return `${dates}, ${t(`leave.halves.${request.half}`)}`
  if (request.unit === 'hours' && request.starts_at !== null && request.ends_at !== null) return `${dates}, ${t('leave.hoursRange', { from: request.starts_at, to: request.ends_at })}`
  return dates
}

/** Durata: "16 h · 2 giorni". */
export const describeDuration = (minutes: number, workingDays: number, t: TFunction, language: string): string =>
  t('leave.duration', { hours: formatHours(minutes, language), days: formatWorkingDays(workingDays, language), count: workingDays })

const limitParamsSchema = z.object({
  limit: z.number(),
  unit: z.enum(['days', 'hours']),
  period: z.enum(['month', 'year', 'request']),
  total: z.number(),
})

/** Testo di un avviso dal codice e dai parametri del server (spec §5.2). */
export const describeWarning = (warning: LeaveWarning, t: TFunction, language: string): string => {
  if (warning.code === 'balance_insufficient' && typeof warning.params.after_minutes === 'number') {
    return t('leave.warnings.balance_insufficient', { hours: formatHours(warning.params.after_minutes, language) })
  }
  const limit = limitParamsSchema.safeParse(warning.params)
  if (warning.code === 'limit_exceeded' && limit.success) {
    const { limit: amount, unit, period, total } = limit.data
    const totalKey = unit === 'days' ? 'leave.warnings.totalDays' : 'leave.warnings.totalHours'
    return t('leave.warnings.limit_exceeded', {
      limit: t(`absenceTypes.limit.${unit}`, { count: amount }),
      period: t(`absenceTypes.limit.periods.${period}`),
      total: t(totalKey, { count: total, value: formatWorkingDays(total, language) }),
    })
  }
  return t('leave.warnings.unknown', { code: warning.code })
}
