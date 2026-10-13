import axe from 'axe-core'
import { expect } from 'vitest'

/** Controllo axe sui componenti: contrasto e landmark si verificano negli E2E (jsdom non calcola gli stili). */
export const expectNoA11yViolations = async (container: Element): Promise<void> => {
  const results = await axe.run(
    {
      include: [container],
      // Con un dialog modale aperto Radix nasconde il resto della pagina (aria-hidden) e imprigiona il focus:
      // axe non rileva la trappola e segnala lo sfondo e le guardie di focus (falso positivo noto).
      // Si escludono solo quelli: il contenuto del dialog resta controllato
      exclude: [['[data-radix-focus-guard]'], ['[data-aria-hidden="true"]']],
    },
    { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } },
  )
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
}
