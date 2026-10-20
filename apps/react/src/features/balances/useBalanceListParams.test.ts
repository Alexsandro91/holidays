import { describe, expect, it } from 'vitest'
import { DEFAULT_BALANCE_LIST_PARAMS, parseBalanceListParams, serializeBalanceListParams, withoutLocation } from '@/features/balances/useBalanceListParams'

describe('balance list params', () => {
  it('reads and writes search, negative, location, sort and page', () => {
    const params = parseBalanceListParams(new URLSearchParams('search=rossi&negative=1&location=3&sort=-location&page=2'))
    expect(params).toEqual({ search: 'rossi', onlyNegative: true, location: 3, sort: '-location', page: 2 })
    expect(serializeBalanceListParams(params).toString()).toBe('search=rossi&negative=1&location=3&sort=-location&page=2')
  })

  it('writes nothing for the defaults', () => {
    expect(serializeBalanceListParams(DEFAULT_BALANCE_LIST_PARAMS).toString()).toBe('')
  })

  it('ignores unknown values', () => {
    const params = parseBalanceListParams(new URLSearchParams('location=abc&sort=email&page=-4&negative=yes'))
    expect(params).toEqual(DEFAULT_BALANCE_LIST_PARAMS)
  })

  it('drops location filter and sort when the location is not shown', () => {
    expect(withoutLocation({ ...DEFAULT_BALANCE_LIST_PARAMS, location: 2, sort: '-location' })).toEqual(DEFAULT_BALANCE_LIST_PARAMS)
    expect(withoutLocation({ ...DEFAULT_BALANCE_LIST_PARAMS, sort: '-name' }).sort).toBe('-name')
  })
})
