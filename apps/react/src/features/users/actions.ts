import type { ManagedUser } from '@/features/users/api'

export type UserAction = 'resend' | 'cancel' | 'changeRole' | 'disable' | 'enable'

/** Azioni del menu di riga: solo quelle che il backend accetta per quello stato e quel ruolo. */
export const availableActions = (user: ManagedUser): UserAction[] => {
  if (user.is_current_user) return []
  if (user.status === 'invited') return ['resend', 'cancel']
  if (user.status === 'disabled') return ['enable']
  // Il ruolo admin si gestisce solo nella sezione amministratori
  return user.role === 'admin' ? ['disable'] : ['changeRole', 'disable']
}

/** Disattivare o riattivare un admin chiede la password di chi agisce (spec fase 3 §5.6). */
export const needsPassword = (user: ManagedUser, action: UserAction): boolean =>
  user.role === 'admin' && (action === 'disable' || action === 'enable')
