import { z } from 'zod'
import i18n from '@/lib/i18n'

export type ApiErrorKind = 'unauthenticated' | 'forbidden' | 'csrf' | 'validation' | 'throttled' | 'network' | 'server'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface ApiErrorInit {
  status: number
  kind: ApiErrorKind
  message: string
  fieldErrors?: Record<string, string[]>
  meta?: Record<string, unknown>
  retryAfter?: number | null
}

/** Errore unico per tutte le chiamate: la UI decide cosa mostrare in base a `kind`. */
export class ApiError extends Error {
  readonly status: number
  readonly kind: ApiErrorKind
  readonly fieldErrors: Record<string, string[]>
  readonly meta: Record<string, unknown>
  readonly retryAfter: number | null

  constructor(init: ApiErrorInit) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.kind = init.kind
    this.fieldErrors = init.fieldErrors ?? {}
    this.meta = init.meta ?? {}
    this.retryAfter = init.retryAfter ?? null
  }
}

export const isApiError = (error: unknown, kind?: ApiErrorKind): error is ApiError =>
  error instanceof ApiError && (kind === undefined || error.kind === kind)

const errorBodySchema = z.object({
  message: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

const kindFromStatus = (status: number): ApiErrorKind => {
  switch (status) {
    case 401:
      return 'unauthenticated'
    case 403:
      return 'forbidden'
    case 419:
      return 'csrf'
    case 422:
      return 'validation'
    case 429:
      return 'throttled'
    default:
      return 'server'
  }
}

// URL assoluto sulla stessa origine: in sviluppo il proxy di Vite inoltra /api e /sanctum a Laravel
const toUrl = (path: string): string => new URL(path, window.location.origin).toString()

const readCookie = (name: string): string | null => {
  const entry = document.cookie.split('; ').find((cookie) => cookie.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null
}

let csrfRequest: Promise<void> | null = null

const refreshCsrfCookie = (): Promise<void> => {
  csrfRequest ??= fetch(toUrl('/sanctum/csrf-cookie'), { credentials: 'include', headers: { Accept: 'application/json' } })
    .then(() => undefined)
    .finally(() => {
      csrfRequest = null
    })
  return csrfRequest
}

const parseRetryAfter = (value: string | null): number | null => {
  if (!value) return null
  const seconds = Number.parseInt(value, 10)
  return Number.isNaN(seconds) ? null : seconds
}

const send = async (method: HttpMethod, path: string, body: unknown): Promise<Response> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': i18n.language,
    'X-Requested-With': 'XMLHttpRequest',
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const xsrf = readCookie('XSRF-TOKEN')
  if (xsrf) headers['X-XSRF-TOKEN'] = xsrf

  try {
    return await fetch(toUrl(path), {
      method,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError({ status: 0, kind: 'network', message: i18n.t('errors.network') })
  }
}

const readJson = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Richiesta all'API Laravel: restituisce il JSON (null se vuoto) o lancia `ApiError`. */
export const request = async (method: HttpMethod, path: string, body?: unknown): Promise<unknown> => {
  if (method !== 'GET' && !readCookie('XSRF-TOKEN')) await refreshCsrfCookie()

  let response = await send(method, path, body)
  if (response.status === 419) {
    // Token CSRF scaduto: si rinnova e si riprova una sola volta
    await refreshCsrfCookie()
    response = await send(method, path, body)
  }

  const payload = await readJson(response)
  if (response.ok) return payload

  const parsed = errorBodySchema.safeParse(payload)
  const data: z.infer<typeof errorBodySchema> = parsed.success ? parsed.data : {}
  throw new ApiError({
    status: response.status,
    kind: kindFromStatus(response.status),
    message: data.message ?? i18n.t('errors.generic'),
    fieldErrors: data.errors,
    meta: data.meta,
    retryAfter: parseRetryAfter(response.headers.get('Retry-After')),
  })
}

/** Come `request`, ma valida la risposta con uno schema zod (niente cast di tipo). */
export const requestData = async <T>(method: HttpMethod, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> =>
  schema.parse(await request(method, path, body))
