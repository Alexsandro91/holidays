import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, addMonths, isDateText, monthOf, monthRange, monthWeeks, shiftMonth, TIME_SLOTS, todayLocal, weekEdge } from '@/features/leave/calendarDates'

describe('calendarDates', () => {
  afterEach(() => vi.useRealTimers())

  it('reads today from the device calendar day', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 20, 23, 30))
    expect(todayLocal()).toBe('2026-10-20')
  })

  it('moves by days, months and weeks without the device time zone', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-29', -1)).toBe('2026-03-28')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-28')
    expect(monthOf('2026-10-20')).toBe('2026-10')
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    // 20 ottobre 2026 è un martedì
    expect(weekEdge('2026-10-20', 'start')).toBe('2026-10-19')
    expect(weekEdge('2026-10-20', 'end')).toBe('2026-10-25')
  })

  it('lays out the month in weeks starting on Monday', () => {
    const weeks = monthWeeks('2026-10')
    // 1 ottobre 2026 è un giovedì: tre caselle vuote in testa
    expect(weeks[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(weeks).toHaveLength(5)
    expect(weeks[4]).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null])
  })

  it('accepts only real dates', () => {
    expect(isDateText('2026-02-28')).toBe(true)
    expect(isDateText('2026-02-30')).toBe(false)
    expect(isDateText('')).toBe(false)
  })

  it('offers times in 30-minute steps', () => {
    expect(TIME_SLOTS).toHaveLength(48)
    expect(TIME_SLOTS.slice(0, 3)).toEqual(['00:00', '00:30', '01:00'])
    expect(TIME_SLOTS.at(-1)).toBe('23:30')
  })
})
