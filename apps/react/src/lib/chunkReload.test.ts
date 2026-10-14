import { afterEach, describe, expect, it, vi } from 'vitest'
import { reloadOnceForNewVersion } from '@/lib/chunkReload'
import { reloadPage } from '@/lib/reload'

vi.mock('@/lib/reload', () => ({ reloadPage: vi.fn() }))

describe('reloadOnceForNewVersion', () => {
  afterEach(() => {
    window.sessionStorage.clear()
    vi.mocked(reloadPage).mockClear()
  })

  it('reloads once when a chunk of an old version is missing', () => {
    expect(reloadOnceForNewVersion(1_000_000)).toBe(true)
    expect(reloadPage).toHaveBeenCalledTimes(1)
  })

  it('does not reload again right after a reload, so a broken page cannot loop', () => {
    reloadOnceForNewVersion(1_000_000)

    expect(reloadOnceForNewVersion(1_005_000)).toBe(false)
    expect(reloadPage).toHaveBeenCalledTimes(1)
    // Passato il tempo di guardia può riprovare (es. un altro deploy più tardi)
    expect(reloadOnceForNewVersion(1_100_000)).toBe(true)
  })
})
