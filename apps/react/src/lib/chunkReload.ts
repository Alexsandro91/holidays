import { reloadPage } from '@/lib/reload'

const RELOAD_KEY = 'holidays-chunk-reload'
// Tempo di guardia tra due ricariche automatiche: se anche dopo la ricarica un chunk manca, si mostra l'errore
const RELOAD_GUARD_MS = 10_000

/**
 * Un chunk della versione caricata non esiste più (deploy nel frattempo): ricarica la pagina una volta sola, per
 * scaricare la versione nuova. Restituisce true se ha avviato la ricarica.
 */
export const reloadOnceForNewVersion = (now = Date.now()): boolean => {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY))
    if (last > 0 && now - last < RELOAD_GUARD_MS) return false
    window.sessionStorage.setItem(RELOAD_KEY, String(now))
  } catch {
    // sessionStorage non disponibile: niente ricarica automatica, resta la pagina d'errore con il pulsante
    return false
  }
  reloadPage()
  return true
}
