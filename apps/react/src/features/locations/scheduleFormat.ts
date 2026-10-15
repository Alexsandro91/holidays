/** Giorni della settimana in ordine di orario: lunedì primo, come `minutes` dell'API (spec SP2 fase 1 §2.3). */
export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export const WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

/** Orario di partenza della prima sede: lunedì-venerdì, 8 ore */
export const DEFAULT_WEEK: number[] = [480, 480, 480, 480, 480, 0, 0]

/** Oggi tutte le sedi sono in Italia (spec §1): fuso usato quando la sede non è nota (es. orario personale) */
export const DEFAULT_TIMEZONE = 'Europe/Rome'

const STEP = 15
const MAX_MINUTES = 720

/** Minuti in ore leggibili: 480 → "8", 270 → "4:30". */
export const formatMinutes = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? String(hours) : `${hours}:${String(rest).padStart(2, '0')}`
}

const isAllowed = (minutes: number): boolean => Number.isInteger(minutes) && minutes >= 0 && minutes <= MAX_MINUTES && minutes % STEP === 0

/**
 * Ore scritte da una persona in minuti: "8", "4:30", "7.5" o "7,25". null se non è un quarto d'ora tra 0 e 12 ore
 * (spec §2.3: multipli di 15, da 0 a 720).
 */
export const parseHours = (text: string): number | null => {
  const value = text.trim()
  const clock = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (clock) {
    const minutes = Number(clock[2])
    if (minutes >= 60) return null
    const total = Number(clock[1]) * 60 + minutes
    return isAllowed(total) ? total : null
  }
  if (!/^\d{1,2}([.,]\d{1,2})?$/.test(value)) return null
  const total = Math.round(Number(value.replace(',', '.')) * 60)
  return isAllowed(total) ? total : null
}

/** Errore della settimana: ore non valide (prima) o nessun giorno lavorativo. null se va bene. */
export const validateWeek = (minutes: number[]): 'invalidHours' | 'noWorkingDay' | null => {
  if (minutes.length !== WEEKDAYS.length || minutes.some((value) => !isAllowed(value))) return 'invalidHours'
  if (minutes.every((value) => value === 0)) return 'noWorkingDay'
  return null
}

/** Data di oggi (YYYY-MM-DD) nel fuso della sede: `valid_from` si confronta con questa, non con il giorno del dispositivo. */
export const todayIn = (timeZone: string, now: Date = new Date()): string =>
  // en-CA scrive già le date come YYYY-MM-DD
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
