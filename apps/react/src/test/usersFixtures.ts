import type { ManagedUser } from '@/features/users/api'

export const managedUser = (overrides: Partial<ManagedUser> = {}): ManagedUser => ({
  id: 2,
  name: 'Marco Bianchi',
  email: 'marco@holidays.test',
  role: 'employee',
  role_label: 'Dipendente',
  status: 'active',
  status_label: 'Attivo',
  invitation_expires_at: null,
  is_current_user: false,
  ...overrides,
})

export const userListResponse = (users: ManagedUser[], counts = { all: users.length, active: users.length, invited: 0, disabled: 0 }) => ({
  data: users,
  links: {},
  meta: { current_page: 1, last_page: 1, per_page: 25, total: users.length, counts },
})
