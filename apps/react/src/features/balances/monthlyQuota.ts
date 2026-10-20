/**
 * Quota mensile in minuti, come `BalanceAccrualService::monthlyQuota` del backend (spec §4.2):
 * `round(annuo × settimanali persona ÷ settimanali sede ÷ 12)`, half-up, in aritmetica intera. 0 se manca un termine.
 */
export const monthlyQuota = (annual: number, weekly: number, locationWeekly: number): number => {
  if (annual <= 0 || weekly <= 0 || locationWeekly <= 0) return 0
  const numerator = annual * weekly
  const denominator = locationWeekly * 12
  return Math.floor((2 * numerator + denominator) / (2 * denominator))
}
