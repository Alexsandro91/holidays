import { describe, expect, it } from 'vitest'
import { DEFAULT_USER_LIST_PARAMS } from '@/features/users/api'
import { countPanelFilters, parseUserListParams, serializeUserListParams, withoutLocation } from '@/features/users/useUserListParams'

describe('user list params', () => {
  it('reads and writes location and employment type', () => {
    const params = parseUserListParams(new URLSearchParams('location=3&employment_type=intern&sort=-location'))
    expect(params.location).toBe(3)
    expect(params.employmentType).toBe('intern')
    expect(params.sort).toBe('-location')
    expect(serializeUserListParams(params).toString()).toBe('employment_type=intern&location=3&sort=-location')
  })

  it('ignores unknown values', () => {
    const params = parseUserListParams(new URLSearchParams('location=abc&employment_type=boss'))
    expect(params.location).toBeNull()
    expect(params.employmentType).toBe('all')
  })

  it('counts location and type among the panel filters', () => {
    expect(countPanelFilters({ ...DEFAULT_USER_LIST_PARAMS, location: 2, employmentType: 'contractor' })).toBe(2)
  })

  it('drops location filter and sort when the location is not shown', () => {
    expect(withoutLocation({ ...DEFAULT_USER_LIST_PARAMS, location: 2, sort: '-location' })).toEqual(DEFAULT_USER_LIST_PARAMS)
    expect(withoutLocation({ ...DEFAULT_USER_LIST_PARAMS, sort: '-email' }).sort).toBe('-email')
  })
})
