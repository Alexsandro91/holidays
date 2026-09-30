import axe from 'axe-core'
import { expect } from 'vitest'

/** Controllo axe sui componenti: contrasto e landmark si verificano negli E2E (jsdom non calcola gli stili). */
export const expectNoA11yViolations = async (container: Element): Promise<void> => {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  })
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
}
