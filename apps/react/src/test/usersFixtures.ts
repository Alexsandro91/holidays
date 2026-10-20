import type { ManagedUser } from '@/features/users/api'

/** Nessuna azione permessa (es. la propria riga, o un admin visto da un responsabile). */
export const NO_ACTIONS: ManagedUser['can'] = {
  resend_invitation: false,
  cancel_invitation: false,
  change_role: false,
  disable: false,
  enable: false,
  update: false,
  send_password_reset: false,
  change_location: false,
  manage_schedule: false,
  view_history: false,
  view_balances: false,
  adjust_balances: false,
  manage_absence_types: false,
}

/** Azioni della fase 3 e 4 permesse: lo stato decide poi quali compaiono. Orario, storico e sede si attivano nei test che le provano. */
export const ALL_ACTIONS: ManagedUser['can'] = {
  resend_invitation: true,
  cancel_invitation: true,
  change_role: true,
  disable: true,
  enable: true,
  update: true,
  send_password_reset: true,
  change_location: false,
  manage_schedule: false,
  view_history: false,
  view_balances: false,
  adjust_balances: false,
  manage_absence_types: false,
}

/** Tutte le azioni, comprese orario personale, storico e cambio sede (vista dell'admin). */
export const ADMIN_ACTIONS: ManagedUser['can'] = { ...ALL_ACTIONS, change_location: true, manage_schedule: true, view_history: true }

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
    role_label: 'Utente',
    status: 'active',
    status_label: 'Attivo',
    invitation_expires_at: null,
    is_current_user: false,
    location: { id: 1, name: 'Sede principale' },
    employment_type: 'employee',
    employment_type_label: 'Dipendente',
    can: overrides.is_current_user === true ? NO_ACTIONS : ALL_ACTIONS,
    ...overrides,
  }
}

export const userListResponse = (users: ManagedUser[], counts = { all: users.length, active: users.length, invited: 0, disabled: 0 }) => ({
  data: users,
  links: {},
  meta: { current_page: 1, last_page: 1, per_page: 25, total: users.length, counts },
})
