import { describe, expect, it } from 'vitest'
import { DEFAULT_WEEK, formatMinutes, nextDay, parseHours, proposedValidFrom, todayIn, validateWeek } from '@/features/locations/scheduleFormat'

describe('formatMinutes', () => {
  it('writes whole hours without minutes and the rest as h:mm', () => {
    expect(formatMinutes(480)).toBe('8')
    expect(formatMinutes(270)).toBe('4:30')
    expect(formatMinutes(15)).toBe('0:15')
    expect(formatMinutes(0)).toBe('0')
    expect(formatMinutes(720)).toBe('12')
  })
})

describe('parseHours', () => {
  it('reads hours with a colon, a dot or a comma', () => {
    expect(parseHours('8')).toBe(480)
    expect(parseHours('4:30')).toBe(270)
    expect(parseHours('7.5')).toBe(450)
    expect(parseHours('7,25')).toBe(435)
    expect(parseHours(' 6:45 ')).toBe(405)
    expect(parseHours('0')).toBe(0)
  })

  it('rejects values that are not quarters of an hour or are out of range', () => {
    expect(parseHours('')).toBeNull()
    expect(parseHours('abc')).toBeNull()
    expect(parseHours('4:10')).toBeNull()
    expect(parseHours('4:60')).toBeNull()
    expect(parseHours('12:15')).toBeNull()
    expect(parseHours('13')).toBeNull()
    expect(parseHours('-1')).toBeNull()
  })
})

describe('validateWeek', () => {
  it('accepts a week with at least one working day', () => {
    expect(validateWeek(DEFAULT_WEEK)).toBeNull()
    expect(validateWeek([0, 0, 0, 0, 0, 240, 0])).toBeNull()
  })

  it('reports invalid hours before an empty week', () => {
    expect(validateWeek([480, Number.NaN, 480, 480, 480, 0, 0])).toBe('invalidHours')
    expect(validateWeek([0, 0, 0, 0, 0, 0, 0])).toBe('noWorkingDay')
    expect(validateWeek([480, 480])).toBe('invalidHours')
  })
})

describe('todayIn', () => {
  it('uses the calendar day of the location, not the one of the device', () => {
    // 23:30 UTC del 14 ottobre: a Roma è già il 15
    expect(todayIn('Europe/Rome', new Date('2026-10-14T23:30:00Z'))).toBe('2026-10-15')
    expect(todayIn('Europe/Rome', new Date('2026-10-14T10:00:00Z'))).toBe('2026-10-14')
  })
})

describe('nextDay', () => {
  it('moves to the next calendar day across months, years and leap days', () => {
    expect(nextDay('2026-10-15')).toBe('2026-10-16')
    expect(nextDay('2026-10-31')).toBe('2026-11-01')
    expect(nextDay('2026-12-31')).toBe('2027-01-01')
    expect(nextDay('2028-02-28')).toBe('2028-02-29')
    // Cambio dell'ora legale: nessuno spostamento di giorno
    expect(nextDay('2026-03-28')).toBe('2026-03-29')
    expect(nextDay('2026-03-29')).toBe('2026-03-30')
  })
})

describe('proposedValidFrom', () => {
  it('proposes tomorrow when a version already starts today, otherwise today', () => {
    expect(proposedValidFrom('2026-10-15', '2026-10-15')).toBe('2026-10-16')
    expect(proposedValidFrom('2026-10-15', '2026-01-01')).toBe('2026-10-15')
    expect(proposedValidFrom('2026-10-15', undefined)).toBe('2026-10-15')
  })
})
