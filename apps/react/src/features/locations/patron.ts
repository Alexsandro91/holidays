// Giorni dei mesi in un anno non bisestile: il 29 febbraio non è un patrono valido (spec SP2 fase 1 §2.1)
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** Patrono scritto come "gg/mm": null se il campo è vuoto (nessun patrono), 'invalid' se la data non esiste. */
export const parsePatron = (text: string): { day: number; month: number } | null | 'invalid' => {
  const value = text.trim()
  if (value === '') return null
  const match = /^(\d{1,2})\/(\d{1,2})$/.exec(value)
  if (!match) return 'invalid'
  const day = Number(match[1])
  const month = Number(match[2])
  const days = DAYS_IN_MONTH[month - 1]
  if (days === undefined || day < 1 || day > days) return 'invalid'
  return { day, month }
}

/** Patrono come "gg/mm" (vuoto senza patrono), per il campo del form e la lettura. */
export const formatPatron = (day: number | null, month: number | null): string =>
  day === null || month === null ? '' : `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
