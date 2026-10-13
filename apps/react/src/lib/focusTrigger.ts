/**
 * Dopo un dialog il focus deve tornare all'elemento che lo ha aperto (spesso già chiuso o rimosso, come
 * una voce di menu): i dialog fermano l'auto-focus di Radix e lo riportano qui.
 * Tra più corrispondenze (tabella e schede) si sceglie quella visibile; se non ce n'è, il fallback.
 */
export const USER_TRIGGER_ATTRIBUTE = 'data-user-actions-trigger'
export const REVOKE_TRIGGER_ATTRIBUTE = 'data-admin-revoke-trigger'

export const focusTrigger = (attribute: string, id: number | string | null, fallbackSelector = '#page-title'): void => {
  const triggers = id === null ? [] : Array.from(document.querySelectorAll<HTMLElement>(`[${attribute}="${id}"]`))
  const target = triggers.find((trigger) => trigger.offsetParent !== null) ?? triggers[0] ?? document.querySelector<HTMLElement>(fallbackSelector)
  target?.focus()
}
