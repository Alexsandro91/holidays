import type { ManagedUser } from '@/features/users/api'

/** Nessuna azione permessa (es. la propria riga, o un admin visto da un responsabile). */
export const NO_ACTIONS: ManagedUser['can'] = { resend_invitation: false, cancel_invitation: false, change_role: false, disable: false, enable: false, update: false }

/** Tutte le azioni permesse: lo stato decide poi quali compaiono. */
export const ALL_ACTIONS: ManagedUser['can'] = { resend_invitation: true, cancel_invitation: true, change_role: true, disable: true, enable: true, update: true }

/** Utente della lista; nome e cognome, se mancano, si ricavano da `name` dividendo al primo spazio (come la migration). */
export const managedUser = (overrides: Partial<ManagedUser> = {}): ManagedUser => {
  const name = overrides.name ?? 'Marco Bianchi'
  const [firstName = '', ...rest] = name.split(' ')
  return {
    id: 2,
    first_name: firstName,
    last_name: rest.join(' '),
    name,
    email: 'marco@holidays.test',
    role: 'employee',
    role_label: 'Dipendente',
    status: 'active',
    status_label: 'Attivo',
    invitation_expires_at: null,
    is_current_user: false,
    can: overrides.is_current_user === true ? NO_ACTIONS : ALL_ACTIONS,
    ...overrides,
  }
}

export const userListResponse = (users: ManagedUser[], counts = { all: users.length, active: users.length, invited: 0, disabled: 0 }) => ({
  data: users,
  links: {},
  meta: { current_page: 1, last_page: 1, per_page: 25, total: users.length, counts },
})
