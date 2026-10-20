import type { TFunction } from 'i18next'
import type { AbsenceType } from '@/features/absenceTypes/api'

const EMPLOYMENT_ORDER: AbsenceType['employment_types'] = ['employee', 'contractor', 'intern']

/** "Giorni, Mezze giornate": come si chiede il tipo. */
export const requestUnits = (type: AbsenceType, t: TFunction): string =>
  [
    type.allows_days && t('absenceTypes.units.days'),
    type.allows_half_days && t('absenceTypes.units.halfDays'),
    type.allows_hours && t('absenceTypes.units.hours'),
  ]
    .filter((label) => typeof label === 'string')
    .join(', ')

/** "Tutti" se vale per ogni tipo di rapporto, altrimenti l'elenco. */
export const employmentLabel = (type: AbsenceType, t: TFunction): string =>
  type.employment_types.length === EMPLOYMENT_ORDER.length
    ? t('absenceTypes.employment.all')
    : EMPLOYMENT_ORDER.filter((item) => type.employment_types.includes(item))
        .map((item) => t(`absenceTypes.employment.${item}`))
        .join(', ')

/** "3 giorni al mese", oppure "Nessun limite". */
export const limitLabel = (type: AbsenceType, t: TFunction): string =>
  type.limit === null
    ? t('absenceTypes.limit.none')
    : `${t(`absenceTypes.limit.${type.limit.unit}`, { count: type.limit.amount })} ${t(`absenceTypes.limit.periods.${type.limit.period}`)}`

export const balanceLabel = (type: AbsenceType, t: TFunction): string => t(`absenceTypes.balances.${type.balance ?? 'none'}`)
