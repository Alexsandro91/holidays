import { userSchema, type User } from '@/features/auth/api'

export const adminUser: User = {
  id: 1,
  first_name: 'Giulia',
  last_name: 'Rossi',
  name: 'Giulia Rossi',
  email: 'admin@holidays.test',
  role: 'admin',
  role_label: 'HR / Admin',
  status: 'active',
  locale: 'it',
  last_login_at: null,
}

interface SessionSeconds {
  /** Inattività ammessa (default 2 ore, come `session.lifetime` di Laravel) */
  idle?: number
  /** Secondi rimasti alla durata assoluta (default 12 ore) */
  absolute?: number
}

/** Risposta di `GET /api/auth/user` e `PATCH /api/profile`: l'utente e i limiti della sessione (spec fase 4 §2.1). */
export const currentUserResponse = (user: User = adminUser, { idle = 7200, absolute = 43_200 }: SessionSeconds = {}) => {
  // La sessione non è un campo della risorsa (nel frontend la ricava la lettura da `meta.session`): lo schema la toglie
  return { data: userSchema.parse(user), meta: { session: { idle_timeout_seconds: idle, absolute_remaining_seconds: absolute } } }
}
