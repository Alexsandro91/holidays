import { describe, expect, it } from 'vitest'
import { safeRedirect } from '@/lib/safeRedirect'

describe('safeRedirect', () => {
  it('keeps internal paths with their query string', () => {
    expect(safeRedirect('/admin/users?status=invited')).toBe('/admin/users?status=invited')
  })

  it.each([null, undefined, '', 'https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/login', '/login?x=1'])(
    'falls back to the home page for %s',
    (target) => {
      expect(safeRedirect(target)).toBe('/')
    },
  )
})
