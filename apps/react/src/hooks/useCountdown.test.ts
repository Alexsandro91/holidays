import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCountdown } from '@/hooks/useCountdown'

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts down from the initial seconds to zero', () => {
    const { result } = renderHook(() => useCountdown(3))
    expect(result.current.secondsLeft).toBe(3)

    act(() => {
      vi.advanceTimersByTime(3_000)
    })
    expect(result.current.secondsLeft).toBe(0)
  })

  it('restarts when start() is called', () => {
    const { result } = renderHook(() => useCountdown())
    expect(result.current.secondsLeft).toBe(0)

    act(() => {
      result.current.start(30)
    })
    expect(result.current.secondsLeft).toBe(30)
  })
})
