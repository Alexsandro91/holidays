import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { isApiError, request, requestData } from '@/lib/api'
import { server } from '@/test/server'

describe('api client', () => {
  it('sends the XSRF token and the interface language', async () => {
    document.cookie = 'XSRF-TOKEN=abc%3D; path=/'
    // Oggetto contenitore: TypeScript non segue le assegnazioni fatte dentro una callback
    const captured: { headers?: Headers } = {}
    server.use(
      http.post('/api/ping', ({ request: incoming }) => {
        captured.headers = incoming.headers
        return HttpResponse.json({ ok: true })
      }),
    )

    await expect(request('POST', '/api/ping', { a: 1 })).resolves.toEqual({ ok: true })
    expect(captured.headers?.get('X-XSRF-TOKEN')).toBe('abc=')
    expect(captured.headers?.get('Accept-Language')).toBe('it')
  })

  it('fetches the CSRF cookie before the first write', async () => {
    let csrfCalls = 0
    server.use(
      http.get('/sanctum/csrf-cookie', () => {
        csrfCalls += 1
        document.cookie = 'XSRF-TOKEN=fresh; path=/'
        return new HttpResponse(null, { status: 204 })
      }),
      http.post('/api/ping', ({ request: incoming }) => HttpResponse.json({ token: incoming.headers.get('X-XSRF-TOKEN') })),
    )

    await expect(request('POST', '/api/ping')).resolves.toEqual({ token: 'fresh' })
    expect(csrfCalls).toBe(1)
  })

  it('maps validation errors with field messages and meta', async () => {
    document.cookie = 'XSRF-TOKEN=x; path=/'
    server.use(
      http.post('/api/ping', () =>
        HttpResponse.json({ message: 'Dati non validi.', errors: { email: ['Obbligatoria.'] }, meta: { attempts_left: 2 } }, { status: 422 }),
      ),
    )

    const error = await request('POST', '/api/ping').catch((caught: unknown) => caught)

    expect(isApiError(error, 'validation')).toBe(true)
    if (!isApiError(error)) return
    expect(error.fieldErrors.email).toEqual(['Obbligatoria.'])
    expect(error.meta.attempts_left).toBe(2)
  })

  it('reads Retry-After when throttled', async () => {
    document.cookie = 'XSRF-TOKEN=x; path=/'
    server.use(http.post('/api/ping', () => HttpResponse.json({ message: 'Troppi.' }, { status: 429, headers: { 'Retry-After': '42' } })))

    const error = await request('POST', '/api/ping').catch((caught: unknown) => caught)

    expect(isApiError(error, 'throttled')).toBe(true)
    if (!isApiError(error)) return
    expect(error.retryAfter).toBe(42)
  })

  it('renews the CSRF token once after a 419', async () => {
    document.cookie = 'XSRF-TOKEN=stale; path=/'
    let attempts = 0
    server.use(
      http.post('/api/ping', () => {
        attempts += 1
        return attempts === 1 ? HttpResponse.json({ message: 'CSRF token mismatch.' }, { status: 419 }) : HttpResponse.json({ ok: true })
      }),
    )

    await expect(request('POST', '/api/ping')).resolves.toEqual({ ok: true })
    expect(attempts).toBe(2)
  })

  it('returns null for empty responses', async () => {
    document.cookie = 'XSRF-TOKEN=x; path=/'
    server.use(http.post('/api/ping', () => new HttpResponse(null, { status: 204 })))

    await expect(request('POST', '/api/ping')).resolves.toBeNull()
  })

  it('rejects responses that do not match the schema', async () => {
    server.use(http.get('/api/thing', () => HttpResponse.json({ id: 'not-a-number' })))

    await expect(requestData('GET', '/api/thing', z.object({ id: z.number() }))).rejects.toThrow()
  })

  it('reports network failures', async () => {
    server.use(http.get('/api/down', () => HttpResponse.error()))

    const error = await request('GET', '/api/down').catch((caught: unknown) => caught)

    expect(isApiError(error, 'network')).toBe(true)
  })
})
