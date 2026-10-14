import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { createQueryClient } from '@/lib/queryClient'
import { sessionEndKey, userQueryKey } from '@/lib/queryKeys'
import { rememberedSessionEnd } from '@/lib/sessionEnd'

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

  it('refreshes the current user when any request is forbidden (the role may have changed)', async () => {
    const client = createQueryClient({ retry: false })
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    await client
      .fetchQuery({ queryKey: ['admin', 'users'], queryFn: () => Promise.reject(new ApiError({ status: 403, kind: 'forbidden', message: 'no' })) })
      .catch(() => undefined)

    expect(invalidate).toHaveBeenCalledWith({ queryKey: userQueryKey })
  })

  it('remembers why the server closed the session, from queries and mutations', async () => {
    const client = createQueryClient({ retry: false })
    const disabled = new ApiError({ status: 401, kind: 'unauthenticated', message: 'x', meta: { reason: 'account_disabled' } })

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(disabled) })
      .execute(undefined)
      .catch(() => undefined)
    expect(rememberedSessionEnd(client)).toBe('disabled')

    const expired = new ApiError({ status: 401, kind: 'unauthenticated', message: 'x', meta: { reason: 'session_expired' } })
    await client.fetchQuery({ queryKey: ['other'], queryFn: () => Promise.reject(expired) }).catch(() => undefined)
    expect(rememberedSessionEnd(client)).toBe('expired')
  })

  it('ignores 401 responses without a known reason', async () => {
    const client = createQueryClient({ retry: false })
    const unknown = new ApiError({ status: 401, kind: 'unauthenticated', message: 'x', meta: { reason: 'something_else' } })

    await client.fetchQuery({ queryKey: ['other'], queryFn: () => Promise.reject(unknown) }).catch(() => undefined)

    expect(rememberedSessionEnd(client)).toBeNull()
  })

  it('re-checks the current user when a guest-only request finds a session already open', async () => {
    const client = createQueryClient({ retry: false })
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const conflict = new ApiError({ status: 409, kind: 'server', message: 'x', meta: { reason: 'already_authenticated' } })

    await client.getMutationCache().build(client, { mutationFn: () => Promise.reject(conflict) }).execute(undefined).catch(() => undefined)
    await client.fetchQuery({ queryKey: ['invitation', 'abc'], queryFn: () => Promise.reject(conflict) }).catch(() => undefined)

    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: userQueryKey })
  })

  it('forgets why the previous session ended as soon as the current user is read back', async () => {
    const client = createQueryClient({ retry: false })
    client.setQueryData(sessionEndKey, 'disabled')

    await client.fetchQuery({ queryKey: userQueryKey, queryFn: () => Promise.resolve({ id: 1 }) })

    expect(rememberedSessionEnd(client)).toBeNull()
  })

  it('drops the data of the closed session when the server ends it, like a logout', async () => {
    const client = createQueryClient({ retry: false })
    client.setQueryData(userQueryKey, { id: 1 })
    client.setQueryData(['admin', 'users'], { data: ['Marco'] })
    const disabled = new ApiError({ status: 401, kind: 'unauthenticated', message: 'x', meta: { reason: 'account_disabled' } })
    // Mutation conclusa con le variabili inviate (es. la password di conferma di un admin)
    await client.getMutationCache().build(client, { mutationFn: () => Promise.resolve(null) }).execute({ currentPassword: 'segreta' })

    await client.getMutationCache().build(client, { mutationFn: () => Promise.reject(disabled) }).execute(undefined).catch(() => undefined)

    expect(client.getQueryData(['admin', 'users'])).toBeUndefined()
    expect(client.getMutationCache().getAll()).toHaveLength(0)
    // L'utente resta: le route protette lo vedono con l'errore e mostrano il motivo (non "sei uscito")
    expect(client.getQueryData(userQueryKey)).toEqual({ id: 1 })
    expect(rememberedSessionEnd(client)).toBe('disabled')
  })
})
