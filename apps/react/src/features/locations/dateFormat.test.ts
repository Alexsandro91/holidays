import { describe, expect, it } from 'vitest'
import { daysInclusive, formatDay } from '@/features/locations/dateFormat'

describe('formatDay', () => {
  it('formats a calendar date without moving it with the time zone of the device', () => {
    expect(formatDay('2027-03-29', 'it', { weekday: 'long', day: 'numeric', month: 'long' })).toBe('lunedì 29 marzo')
    expect(formatDay('2026-12-07', 'it')).toBe('7 dicembre 2026')
    expect(formatDay('2026-12-07', 'en')).toBe('December 7, 2026')
  })
})

describe('daysInclusive', () => {
  it('counts both ends', () => {
    expect(daysInclusive('2026-08-10', '2026-08-21')).toBe(12)
    expect(daysInclusive('2026-08-10', '2026-08-10')).toBe(1)
    // Il cambio dell'ora legale non sposta il conteggio
    expect(daysInclusive('2026-10-20', '2026-11-19')).toBe(31)
  })
})
