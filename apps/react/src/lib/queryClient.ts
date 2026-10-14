import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isAlreadyAuthenticated, isApiError } from '@/lib/api'
import { isUserQuery, userQueryKey } from '@/lib/queryKeys'
import { forgetSessionEnd, rememberSessionEnd } from '@/lib/sessionEnd'

interface QueryClientOptions {
  retry?: boolean
}

const needsUserCheck = (error: unknown): boolean =>
  isApiError(error, 'unauthenticated') || isApiError(error, 'forbidden') || isAlreadyAuthenticated(error)

/**
 * QueryClient dell'app: nessun retry sugli errori 4xx e sessione scaduta gestita in un punto solo
 * (un 401 fa ricontrollare l'utente e le route protette mandano al login).
 */
export const createQueryClient = (options: QueryClientOptions = {}): QueryClient => {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onSuccess: (data, query) => {
        // Utente riletto (accesso, sessione ripresa dopo un 409, GuestRoute): il motivo della sessione precedente non vale più
        if (isUserQuery(query.queryKey) && data) forgetSessionEnd(client)
      },
      onError: (error, query) => {
        rememberSessionEnd(client, error)
        // 401: sessione scaduta; 403: il ruolo può essere cambiato (es. admin revocato); 409 already_authenticated: la
        // sessione c'è già (accesso da un'altra scheda). In tutti i casi si rilegge l'utente
        if (needsUserCheck(error) && !isUserQuery(query.queryKey)) {
          void client.invalidateQueries({ queryKey: userQueryKey })
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        rememberSessionEnd(client, error)
        if (needsUserCheck(error)) void client.invalidateQueries({ queryKey: userQueryKey })
      },
    }),
    defaultOptions: {
      queries: {
        // I dati restano "freschi" per 30s: evita di rifare la stessa richiesta a ogni mount
        staleTime: 30_000,
        retry:
          options.retry === false
            ? false
            : (failureCount, error) => !(isApiError(error) && error.status >= 400 && error.status < 500) && failureCount < 2,
      },
      mutations: { retry: false },
    },
  })
  return client
}

export const queryClient = createQueryClient()
