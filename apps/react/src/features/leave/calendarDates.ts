/**
 * Date del calendario personale come testo YYYY-MM-DD (mesi YYYY-MM). I calcoli usano mezzanotte UTC: non si spostano
 * di un giorno con il fuso del dispositivo (vedi features/locations/dateFormat.ts).
 */
/** Giorni scelti sul calendario o nei campi data, estremi compresi. */
export interface LeaveDayRange {
  startsOn: string
  endsOn: string
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const toUtc = (date: string): Date => new Date(`${date}T00:00:00Z`)
const toText = (date: Date): string => date.toISOString().slice(0, 10)
const pad = (value: number): string => String(value).padStart(2, '0')

/** Oggi secondo il calendario del dispositivo: il server ricontrolla con il fuso della sede. */
export const todayLocal = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export const isDateText = (text: string): boolean => DATE_PATTERN.test(text) && !Number.isNaN(toUtc(text).getTime()) && toText(toUtc(text)) === text

export const addDays = (date: string, days: number): string => {
  const value = toUtc(date)
  value.setUTCDate(value.getUTCDate() + days)
  return toText(value)
}

export const monthOf = (date: string): string => date.slice(0, 7)

export const addMonths = (month: string, months: number): string => {
  const value = toUtc(`${month}-01`)
  value.setUTCMonth(value.getUTCMonth() + months)
  return monthOf(toText(value))
}

/** Primo e ultimo giorno del mese. */
export const monthRange = (month: string): { from: string; to: string } => ({ from: `${month}-01`, to: addDays(`${addMonths(month, 1)}-01`, -1) })

/** Lo stesso giorno in un altro mese, fermato all'ultimo giorno se quel mese è più corto (31 gennaio → 28 febbraio). */
export const shiftMonth = (date: string, months: number): string => {
  const month = addMonths(monthOf(date), months)
  const last = monthRange(month).to
  const candidate = `${month}-${date.slice(8, 10)}`
  return candidate > last ? last : candidate
}

/** Posizione nella settimana con il lunedì primo: 0 lunedì … 6 domenica. */
export const mondayIndex = (date: string): number => (toUtc(date).getUTCDay() + 6) % 7

/** Lunedì (`start`) o domenica (`end`) della settimana del giorno. */
export const weekEdge = (date: string, edge: 'start' | 'end'): string => (edge === 'start' ? addDays(date, -mondayIndex(date)) : addDays(date, 6 - mondayIndex(date)))

/** Settimane del mese, dal lunedì alla domenica; `null` per le caselle fuori dal mese. */
export const monthWeeks = (month: string): (string | null)[][] => {
  const { from, to } = monthRange(month)
  const cells: (string | null)[] = Array.from({ length: mondayIndex(from) }, () => null)
  for (let date = from; date <= to; date = addDays(date, 1)) cells.push(date)
  while (cells.length % 7 !== 0) cells.push(null)
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7))
}

/** Orari delle richieste a ore: dalle 00:00 alle 23:30 a passi di 30 minuti (spec §5.1). */
export const TIME_SLOTS: readonly string[] = Array.from({ length: 48 }, (_, index) => `${pad(Math.floor(index / 2))}:${index % 2 === 0 ? '00' : '30'}`)
