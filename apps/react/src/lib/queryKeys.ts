export const userQueryKey: readonly ['auth', 'user'] = ['auth', 'user']

export const isUserQuery = (key: readonly unknown[]): boolean => key[0] === 'auth' && key[1] === 'user'
