import { describe, expect, it } from 'vitest'
import { formatDays, formatHours, parseHours } from '@/features/balances/hoursFormat'

describe('formatHours', () => {
  it.each([
    [5250, 'it', '87,5'],
    [4465, 'it', '74,42'],
    [480, 'it', '8'],
    [-240, 'it', '−4'],
    [5250, 'en', '87.5'],
    [0, 'it', '0'],
  ])('formatHours(%i, %s) = %s', (minutes, locale, expected) => expect(formatHours(minutes, locale)).toBe(expected))
})

describe('parseHours', () => {
  it.each([
    ['74,42', 4465],
    ['74.42', 4465],
    ['-4', -240],
    ['−4', -240],
    [' 8 ', 480],
    ['4,5', 270],
    ['abc', null],
    ['', null],
    ['1,2,3', null],
  ])('parseHours(%s) = %s', (text, expected) => expect(parseHours(text)).toBe(expected))
})

describe('formatDays', () => {
  it('formats equivalent days with one decimal', () => {
    expect(formatDays(5250, 480, 'it')).toBe('10,9')
    expect(formatDays(2400, 240, 'it')).toBe('10')
    expect(formatDays(100, 0, 'it')).toBeNull()
  })
})
