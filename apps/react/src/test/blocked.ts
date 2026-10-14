import { expect } from 'vitest'

/**
 * Pulsante bloccato (invio in corso, conto alla rovescia, limite raggiunto) ma ancora focalizzabile: aria-disabled
 * invece di disabled, così chi lo stava usando non perde il focus, che altrimenti finirebbe sul body.
 */
export const expectBlockedButFocusable = (button: HTMLElement): void => {
  expect(button).toHaveAttribute('aria-disabled', 'true')
  expect(button).toBeEnabled()
}
