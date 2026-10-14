import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import '@/lib/zodConfig'

describe('zod configuration', () => {
  it('never evaluates code from strings, so the production CSP reports no unsafe-eval violation', () => {
    const evaluate = vi.spyOn(globalThis, 'Function')

    expect(z.config().jitless).toBe(true)
    z.object({ email: z.string(), remember: z.boolean() }).parse({ email: 'a@b.it', remember: true })

    expect(evaluate).not.toHaveBeenCalled()
    evaluate.mockRestore()
  })
})
