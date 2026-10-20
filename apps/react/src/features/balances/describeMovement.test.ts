import { describe, expect, it } from 'vitest'
import { describeMovement } from '@/features/balances/describeMovement'
import i18n from '@/lib/i18n'
import { balanceMovement } from '@/test/balancesFixtures'

describe('describeMovement', () => {
  it('names the month of an accrual', () => {
    expect(describeMovement(balanceMovement({ kind: 'accrual', period: '2026-10' }), i18n.t, 'it')).toBe('Maturazione ottobre 2026')
  })

  it('tells the payslip date and the values of an alignment', () => {
    const movement = balanceMovement({ kind: 'alignment', effective_on: '2026-09-30', target_minutes: 4452, minutes: -468, period: null })
    expect(describeMovement(movement, i18n.t, 'it')).toBe('Allineata alla busta paga del 30/09/2026: da 82 a 74,2 h')
  })

  it('gives the reason of an adjustment', () => {
    expect(describeMovement(balanceMovement({ kind: 'adjustment', note: 'ore di agosto non scalate', period: null }), i18n.t, 'it')).toBe('Rettifica: ore di agosto non scalate')
    expect(describeMovement(balanceMovement({ kind: 'adjustment', note: null, period: null }), i18n.t, 'it')).toBe('Rettifica')
  })

  it('uses the hour format of the language', () => {
    const movement = balanceMovement({ kind: 'alignment', effective_on: '2026-09-30', target_minutes: 4452, minutes: -468, period: null })
    expect(describeMovement(movement, i18n.getFixedT('en'), 'en')).toContain('from 82 to 74.2 h')
  })
})
