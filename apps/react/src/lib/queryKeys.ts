export const userQueryKey: readonly ['auth', 'user'] = ['auth', 'user']

export const isUserQuery = (key: readonly unknown[]): boolean => key[0] === 'auth' && key[1] === 'user'

/** Prefisso di tutte le query dell'area admin: si invalidano in blocco dopo ogni modifica. */
export const adminQueryKey: readonly ['admin'] = ['admin']
