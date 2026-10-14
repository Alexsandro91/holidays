/**
 * Ultima attività con la sessione (spec fase 4 §3.3): istante (`Date.now()`) dell'ultima risposta API riuscita.
 * Sta in localStorage perché l'evento `storage` la porti alle altre schede: chi lavora in un'altra scheda non vede
 * l'avviso di scadenza. Senza localStorage ogni scheda usa la propria memoria.
 */
export const ACTIVITY_STORAGE_KEY = 'holidays-last-activity'

let storageAvailable = true
let memoryValue: number | null = null
const listeners = new Set<() => void>()

const parseTimestamp = (value: string | null): number | null => {
  if (value === null) return null
  const timestamp = Number(value)
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null
}

export const recordActivity = (at: number = Date.now()): void => {
  memoryValue = at
  try {
    window.localStorage.setItem(ACTIVITY_STORAGE_KEY, String(at))
  } catch {
    // localStorage non disponibile (es. navigazione privata): da qui in poi vale la memoria della scheda
    storageAvailable = false
  }
  listeners.forEach((listener) => listener())
}

export const readLastActivity = (): number | null => {
  if (storageAvailable) {
    try {
      return parseTimestamp(window.localStorage.getItem(ACTIVITY_STORAGE_KEY))
    } catch {
      storageAvailable = false
    }
  }
  return memoryValue
}

/** Avvisa a ogni attività di questa scheda e, tramite l'evento `storage`, delle altre. Restituisce la disiscrizione. */
export const subscribeActivity = (listener: () => void): (() => void) => {
  listeners.add(listener)
  // key null: localStorage svuotato da un'altra scheda
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACTIVITY_STORAGE_KEY || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}
