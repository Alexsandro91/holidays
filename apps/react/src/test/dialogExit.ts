import { onTestFinished, vi } from 'vitest'

/**
 * Simula l'animazione di chiusura dei dialog. jsdom non calcola le animazioni CSS e Radix smonta subito il contenuto;
 * nel browser invece il dialog resta nel DOM (data-state="closed") per tutta l'animazione, e un Invio in quel momento
 * può inviare di nuovo il form. Qui il contenuto resta montato finché il test non finisce.
 */
export const holdDialogExitAnimation = (): void => {
  const original = window.getComputedStyle.bind(window)
  const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
    const styles = original(element, pseudo)
    const role = element.getAttribute('role')
    if (role !== 'dialog' && role !== 'alertdialog') return styles
    // Stili "vivi": Radix li legge al montaggio e di nuovo alla chiusura, quando data-state è già "closed"
    return new Proxy(styles, {
      get: (target, property) => {
        if (property === 'animationName') return element.getAttribute('data-state') === 'closed' ? 'dialog-exit' : 'dialog-enter'
        const value: unknown = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  })
  onTestFinished(() => spy.mockRestore())
}
