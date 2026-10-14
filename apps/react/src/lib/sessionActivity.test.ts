import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { request } from '@/lib/api'
import { ACTIVITY_STORAGE_KEY, readLastActivity, recordActivity, subscribeActivity } from '@/lib/sessionActivity'
import { server } from '@/test/server'

describe('session activity', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('records the last activity on every successful API response, not on errors', async () => {
    server.use(
      http.get('/api/ok', () => HttpResponse.json({ ok: true })),
      http.get('/api/ko', () => HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })),
    )

    await request('GET', '/api/ko').catch(() => undefined)
    expect(readLastActivity()).toBeNull()

    const before = Date.now()
    await request('GET', '/api/ok')
    const recorded = readLastActivity() ?? 0
    expect(recorded).toBeGreaterThanOrEqual(before)
    expect(window.localStorage.getItem(ACTIVITY_STORAGE_KEY)).toBe(String(recorded))
  })

  it('hears the activity of other tabs through the storage event', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeActivity(listener)

    window.localStorage.setItem(ACTIVITY_STORAGE_KEY, '1760000000000')
    window.dispatchEvent(new StorageEvent('storage', { key: ACTIVITY_STORAGE_KEY, newValue: '1760000000000' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'holidays-theme', newValue: 'dark' }))

    expect(listener).toHaveBeenCalledTimes(1)
    expect(readLastActivity()).toBe(1_760_000_000_000)
    unsubscribe()
  })

  it('keeps the activity in the tab memory when the browser storage is not available', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    recordActivity(1_760_000_000_000)

    expect(readLastActivity()).toBe(1_760_000_000_000)
  })
})
