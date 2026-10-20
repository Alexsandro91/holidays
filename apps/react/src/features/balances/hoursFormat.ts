const MINUS = '−'

/** Ore decimali della lingua, al massimo 2 cifre e senza zeri finali; il negativo usa il segno meno tipografico. */
export const formatHours = (minutes: number, locale: string): string => {
  const text = new Intl.NumberFormat(locale, { maximumFractionDigits: 2, useGrouping: false }).format(Math.abs(minutes) / 60)
  // Un valore che arrotonda a zero non porta il segno
  return minutes < 0 && Number.parseFloat(text.replace(',', '.')) !== 0 ? `${MINUS}${text}` : text
}

/** Legge ore decimali con virgola o punto e segno - o −; restituisce minuti interi, null se non è un numero. */
export const parseHours = (text: string): number | null => {
  const normalized = text.trim().replace(MINUS, '-').replace(/\s+/g, '').replace(',', '.')
  if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(normalized)) return null
  const hours = Number.parseFloat(normalized)
  return Number.isFinite(hours) ? Math.round(hours * 60) : null
}

/** Giorni equivalenti (1 decimale) sull'orario medio della persona; null se non ha un orario. */
export const formatDays = (minutes: number, averageDayMinutes: number, locale: string): string | null => {
  if (averageDayMinutes <= 0) return null
  const text = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, useGrouping: false }).format(Math.abs(minutes) / averageDayMinutes)
  return minutes < 0 && Number.parseFloat(text.replace(',', '.')) !== 0 ? `${MINUS}${text}` : text
}
