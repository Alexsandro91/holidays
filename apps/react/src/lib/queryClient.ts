import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // I dati restano "freschi" per 30s: evita di rifare la stessa richiesta a ogni mount
      staleTime: 30_000,
    },
  },
})
