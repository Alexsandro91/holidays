import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const server = setupServer(
  http.get('/sanctum/csrf-cookie', () => {
    document.cookie = 'XSRF-TOKEN=test-xsrf-token; path=/'
    return new HttpResponse(null, { status: 204 })
  }),
  http.get('/api/auth/user', () => HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })),
)
