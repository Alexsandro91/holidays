import { describe, expect, it } from 'vitest'
import { monthlyQuota } from '@/features/balances/monthlyQuota'

describe('monthlyQuota', () => {
  it('matches the backend formula, rounding half up', () => {
    expect(monthlyQuota(9600, 2400, 2400)).toBe(800)
    expect(monthlyQuota(9600, 1200, 2400)).toBe(400)
    expect(monthlyQuota(9600, 1440, 2400)).toBe(480)
    expect(monthlyQuota(1000, 2400, 2400)).toBe(83)
    expect(monthlyQuota(1002, 2400, 2400)).toBe(84)
    // 9600 × 1000 ÷ 2400 ÷ 12 = 333,33…
    expect(monthlyQuota(9600, 1000, 2400)).toBe(333)
  })

  it('is 0 when a term is missing', () => {
    expect(monthlyQuota(0, 2400, 2400)).toBe(0)
    expect(monthlyQuota(9600, 0, 2400)).toBe(0)
    expect(monthlyQuota(9600, 2400, 0)).toBe(0)
  })
})
