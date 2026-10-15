export const userQueryKey: readonly ['auth', 'user'] = ['auth', 'user']

/** Motivo per cui il server ha chiuso la sessione (vedi lib/sessionEnd). Non è un dato dell'utente: il logout lo rimuove. */
export const sessionEndKey: readonly ['auth', 'session-end'] = ['auth', 'session-end']

export const isUserQuery = (key: readonly unknown[]): boolean => key[0] === 'auth' && key[1] === 'user'

/** Prefisso di tutte le query dell'area admin: si invalidano in blocco dopo ogni modifica. */
export const adminQueryKey: readonly ['admin'] = ['admin']

/** Sedi, orari, chiusure e calendari: sotto il prefisso admin, così le modifiche agli utenti e alle sedi si invalidano insieme. */
export const locationsQueryKey: readonly ['admin', 'locations'] = [adminQueryKey[0], 'locations']

/** Storico delle persone (profilo e Utenti): fuori dall'utente corrente, quindi il logout lo cancella (clearSessionData). */
export const historyQueryKey: readonly ['history'] = ['history']
