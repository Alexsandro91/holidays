import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isApiError } from '@/lib/api'
import { isUserQuery, userQueryKey } from '@/lib/queryKeys'
import { rememberSessionEnd } from '@/lib/sessionEnd'

interface QueryClientOptions {
  retry?: boolean
}

/**
 * QueryClient dell'app: nessun retry sugli errori 4xx e sessione scaduta gestita in un punto solo
 * (un 401 fa ricontrollare l'utente e le route protette mandano al login).
 */
export const createQueryClient = (options: QueryClientOptions = {}): QueryClient => {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        rememberSessionEnd(client, error)
        // 401: sessione scaduta; 403: il ruolo può essere cambiato (es. admin revocato). In entrambi i casi si rilegge l'utente
        if ((isApiError(error, 'unauthenticated') || isApiError(error, 'forbidden')) && !isUserQuery(query.queryKey)) {
          void client.invalidateQueries({ queryKey: userQueryKey })
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        rememberSessionEnd(client, error)
        if (isApiError(error, 'unauthenticated') || isApiError(error, 'forbidden')) void client.invalidateQueries({ queryKey: userQueryKey })
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
