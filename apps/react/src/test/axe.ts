import axe from 'axe-core'
import { expect } from 'vitest'

/** Controllo axe sui componenti: contrasto e landmark si verificano negli E2E (jsdom non calcola gli stili). */
export const expectNoA11yViolations = async (container: Element): Promise<void> => {
  // Con un dialog modale aperto Radix nasconde il resto della pagina (aria-hidden) e imprigiona il focus:
  // gli elementi nascosti restano focusabili per axe, che non rileva la trappola. È un falso positivo noto
  const modalOpen = container.querySelector('[data-radix-focus-guard]') !== null
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false }, 'aria-hidden-focus': { enabled: !modalOpen } },
  })
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
}
