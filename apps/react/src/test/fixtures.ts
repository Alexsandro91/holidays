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
  location: { id: 1, name: 'Sede principale' },
  employment_type: 'employee',
  employment_type_label: 'Dipendente',
}

interface SessionSeconds {
  /** Inattività ammessa (default 2 ore, come `session.lifetime` di Laravel) */
  idle?: number
  /** Secondi rimasti alla durata assoluta (default 12 ore) */
  absolute?: number
  /** Almeno due sedi attive (default no: l'azienda con una sola sede) */
  multipleLocations?: boolean
  /** Contatore Da approvare (default null: chi non approva) */
  pendingApprovals?: number | null
}

/** Risposta di `GET /api/auth/user` e `PATCH /api/profile`: l'utente, i limiti della sessione e il numero di sedi. */
export const currentUserResponse = (user: User = adminUser, { idle = 7200, absolute = 43_200, multipleLocations = false, pendingApprovals = null }: SessionSeconds = {}) => {
  // Sessione e numero di sedi non sono campi della risorsa (nel frontend li ricava la lettura da `meta`): lo schema li toglie
  return {
    data: userSchema.parse(user),
    meta: { session: { idle_timeout_seconds: idle, absolute_remaining_seconds: absolute }, multiple_locations: multipleLocations, pending_approvals: pendingApprovals },
  }
}
