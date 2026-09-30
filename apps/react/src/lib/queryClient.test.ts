import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api'
import { createQueryClient } from '@/lib/queryClient'
import { userQueryKey } from '@/lib/queryKeys'

describe('query client', () => {
  it('re-checks the current user when another request returns 401', async () => {
    const client = createQueryClient({ retry: false })
    client.setQueryData(userQueryKey, { id: 1 })

    await client
      .fetchQuery({
        queryKey: ['other'],
        queryFn: () => Promise.reject(new ApiError({ status: 401, kind: 'unauthenticated', message: 'Unauthenticated.' })),
      })
      .catch(() => undefined)

    expect(client.getQueryState(userQueryKey)?.isInvalidated).toBe(true)
  })
})
