/** Ricarica la pagina (modulo a parte: nei test si sostituisce, jsdom non permette di intercettare location.reload). */
export const reloadPage = (): void => {
  window.location.reload()
}
