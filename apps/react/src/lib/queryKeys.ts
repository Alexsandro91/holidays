export const userQueryKey: readonly ['auth', 'user'] = ['auth', 'user']

/** Motivo per cui il server ha chiuso la sessione (vedi lib/sessionEnd). Non è un dato dell'utente: il logout lo rimuove. */
export const sessionEndKey: readonly ['auth', 'session-end'] = ['auth', 'session-end']

export const isUserQuery = (key: readonly unknown[]): boolean => key[0] === 'auth' && key[1] === 'user'

/** Prefisso di tutte le query dell'area admin: si invalidano in blocco dopo ogni modifica. */
export const adminQueryKey: readonly ['admin'] = ['admin']
