/**
 * Dopo un dialog aperto da una voce di menu il focus non torna da solo al trigger (il menu è già chiuso):
 * i dialog fermano l'auto-focus di Radix e lo riportano qui al pulsante "Azioni" della riga.
 * Se la riga non c'è più (es. invito annullato) il focus va al titolo della pagina.
 */
export const USER_TRIGGER_ATTRIBUTE = 'data-user-actions-trigger'

export const focusUserActionsTrigger = (userId: number | null): void => {
  const triggers = userId === null ? [] : Array.from(document.querySelectorAll<HTMLElement>(`[${USER_TRIGGER_ATTRIBUTE}="${userId}"]`))
  // Tabella e schede sono entrambe nel DOM: si sceglie quella visibile
  const target = triggers.find((trigger) => trigger.offsetParent !== null) ?? triggers[0] ?? document.getElementById('page-title')
  target?.focus()
}
