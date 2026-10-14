import { createColumnHelper, rowPaginationFeature, rowSortingFeature, tableFeatures, type ReactTable } from '@tanstack/react-table'
import type { ManagedUser } from '@/features/users/api'

/**
 * Funzioni della Data Table utenti: solo ordinamento e paginazione, entrambi manuali (li fa il server, spec §3).
 * Niente row model di ordinamento o paginazione: i dati arrivano già ordinati e paginati.
 * I filtri restano fuori dalla tabella: stanno nell'URL e diventano `filter[...]` della richiesta.
 */
export const usersTableFeatures = tableFeatures({ rowSortingFeature, rowPaginationFeature })

export type UsersTableInstance = ReactTable<typeof usersTableFeatures, ManagedUser>

export const usersColumnHelper = createColumnHelper<typeof usersTableFeatures, ManagedUser>()
