/** Data YYYY-MM-DD come mezzanotte UTC: formattata in UTC non si sposta di un giorno con il fuso del dispositivo. */
const toUtc = (date: string): Date => new Date(`${date}T00:00:00Z`)

/** Data del calendario nella lingua dell'interfaccia (default "7 dicembre 2026"). */
export const formatDay = (date: string, language: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'long' }): string =>
  new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(toUtc(date))

/** Giorni da `from` a `to`, estremi compresi (10–21 agosto = 12): il limite delle chiusure è di 31 (spec §2.4). */
export const daysInclusive = (from: string, to: string): number => Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000) + 1

/**
 * Intervallo di date come "26–30 ottobre 2026". Nello stesso mese lo compone `formatRange` della lingua; altrimenti
 * due date intere (senza l'anno della prima se è lo stesso), perché `formatRange` scrive "03 novembre" in italiano.
 */
export const formatDayRange = (from: string, to: string, language: string): string => {
  if (from === to) return formatDay(from, language)
  const full: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }
  if (from.slice(0, 7) === to.slice(0, 7)) return new Intl.DateTimeFormat(language, { ...full, timeZone: 'UTC' }).formatRange(toUtc(from), toUtc(to))
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${formatDay(from, language, sameYear ? { day: 'numeric', month: 'long' } : full)} – ${formatDay(to, language, full)}`
}
