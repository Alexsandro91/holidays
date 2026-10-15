import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const server = setupServer(
  http.get('/sanctum/csrf-cookie', () => {
    document.cookie = 'XSRF-TOKEN=test-xsrf-token; path=/'
    return new HttpResponse(null, { status: 204 })
  }),
  // Profilo: senza un handler del test lo storico è vuoto (la card c'è in ogni pagina Profilo)
  http.get('/api/profile/history', () => HttpResponse.json({ data: [], links: {}, meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } })),
  http.get('/api/auth/user', () => HttpResponse.json({ message: 'Unauthenticated.' }, { status: 401 })),
)
