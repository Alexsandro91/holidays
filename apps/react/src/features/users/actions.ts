import type { ManagedUser } from '@/features/users/api'

export type UserAction = 'edit' | 'resend' | 'cancel' | 'changeRole' | 'disable' | 'enable'

/**
 * Azioni del menu di riga: quelle che il server permette a chi guarda (`can`) e che lo stato consente.
 * Le regole dei ruoli (sé stessi, admin, responsabili) le decide solo il server.
 */
export const availableActions = ({ status, can }: ManagedUser): UserAction[] => {
  const byStatus: Record<ManagedUser['status'], [UserAction, boolean][]> = {
    invited: [
      ['resend', can.resend_invitation],
      ['cancel', can.cancel_invitation],
    ],
    active: [
      ['changeRole', can.change_role],
      ['disable', can.disable],
    ],
    disabled: [['enable', can.enable]],
  }
  // Modifica (nome, cognome, email degli invitati) vale in ogni stato
  const all: [UserAction, boolean][] = [['edit', can.update], ...byStatus[status]]
  return all.filter(([, allowed]) => allowed).map(([action]) => action)
}

/** Disattivare o riattivare un admin chiede la password di chi agisce (spec fase 3 §5.6). */
export const needsPassword = (user: ManagedUser, action: UserAction): boolean =>
  user.role === 'admin' && (action === 'disable' || action === 'enable')
