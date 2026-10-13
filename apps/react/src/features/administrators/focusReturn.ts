/**
 * Dopo il dialog di revoca il focus torna al pulsante "Revoca" della riga.
 * Se la riga non c'è più (revoca riuscita) il focus va al titolo della pagina.
 */
export const REVOKE_TRIGGER_ATTRIBUTE = 'data-admin-revoke-trigger'

export const focusRevokeTrigger = (userId: number | null): void => {
  const trigger = userId === null ? null : document.querySelector<HTMLElement>(`[${REVOKE_TRIGGER_ATTRIBUTE}="${userId}"]`)
  const target = trigger ?? document.getElementById('page-title')
  target?.focus()
}
