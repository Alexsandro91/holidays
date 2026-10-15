import { describe, expect, it } from 'vitest'
import { formatPatron, parsePatron } from '@/features/locations/patron'

describe('parsePatron', () => {
  it('reads day and month as dd/mm, with or without leading zeros', () => {
    expect(parsePatron('07/12')).toEqual({ day: 7, month: 12 })
    expect(parsePatron('7/12')).toEqual({ day: 7, month: 12 })
    expect(parsePatron(' 29/6 ')).toEqual({ day: 29, month: 6 })
  })

  it('treats an empty field as no patron', () => {
    expect(parsePatron('')).toBeNull()
    expect(parsePatron('   ')).toBeNull()
  })

  it('rejects dates that do not exist in a non-leap year', () => {
    expect(parsePatron('29/02')).toBe('invalid')
    expect(parsePatron('31/04')).toBe('invalid')
    expect(parsePatron('00/05')).toBe('invalid')
    expect(parsePatron('12/13')).toBe('invalid')
    expect(parsePatron('7 dicembre')).toBe('invalid')
  })
})

describe('formatPatron', () => {
  it('writes dd/mm or nothing', () => {
    expect(formatPatron(7, 12)).toBe('07/12')
    expect(formatPatron(null, null)).toBe('')
  })
})
