import type { User } from '@/features/auth/api'

export const adminUser: User = {
  id: 1,
  name: 'Giulia Rossi',
  email: 'admin@holidays.test',
  role: 'admin',
  role_label: 'HR / Admin',
  status: 'active',
  locale: 'it',
  last_login_at: null,
}
