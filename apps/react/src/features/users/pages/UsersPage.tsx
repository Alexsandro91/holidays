import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useManagedUsers, type ManagedUser } from '@/features/users/api'
import UsersFilters from '@/features/users/components/UsersFilters'
import UsersSortSelect from '@/features/users/components/UsersSortSelect'
import UsersTable from '@/features/users/components/UsersTable'
import UserStatusTabs from '@/features/users/components/UserStatusTabs'
import { CLEARED_FILTERS, hasAnyFilter, useUserListParams } from '@/features/users/useUserListParams'

interface UsersPageProps {
  /** Pulsante "Invita utente" */
  headerAction?: ReactNode
  /** Menu azioni per riga */
  renderActions?: (user: ManagedUser) => ReactNode
}

/** Lista utenti: filtri, schede di stato, Data Table con ordinamento e paginazione lato server. Stato completo nell'URL. */
const UsersPage = ({ headerAction, renderActions }: UsersPageProps) => {
  const { t } = useTranslation()
  const { params, setParams } = useUserListParams()
  const location = useLocation()
  const users = useManagedUsers(params)

  // Pagina oltre l'ultima (es. dopo una disattivazione): si torna all'ultima disponibile
  const currentPage = users.data?.meta.current_page
  const lastPage = users.data?.meta.last_page
  useEffect(() => {
    if (currentPage !== undefined && lastPage !== undefined && lastPage >= 1 && currentPage > lastPage) setParams({ page: lastPage }, { replace: true })
  }, [currentPage, lastPage, setParams])

  const filtered = hasAnyFilter(params)

  const clearFilters = () => {
    setParams(CLEARED_FILTERS)
    // Il pulsante sparisce senza filtri: il focus va alla ricerca, sempre visibile, invece di perdersi sul body
    document.getElementById('users-search')?.focus()
  }

  // Esito della vista per chi usa uno screen reader: annunciato quando arrivano i dati nuovi, non con quelli precedenti
  const result = users.data === undefined || users.isPlaceholderData ? '' : users.data.meta.total === 0 ? t('users.empty') : t('users.pagination.total', { count: users.data.meta.total })

  return (
    <>
      {/* Lo spazio sotto è dell'intestazione: resta uguale anche quando il pulsante va a capo */}
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <PageHeading title={t('users.title')} description={t('users.subtitle')} className="mb-0" />
        {headerAction}
      </div>
      <UsersFilters params={params} setParams={setParams} onClear={clearFilters} syncKey={location.key} />
      {/* Live region stabile: montata sempre, fuori dai rami di caricamento, errore e lista vuota */}
      <p role="status" className="sr-only">
        {result}
      </p>
      <UserStatusTabs
        value={params.status}
        counts={users.data?.meta.counts}
        onChange={(status) => setParams({ status, page: 1 })}
        // Su mobile le schede non hanno intestazioni da cliccare: l'ordinamento passa da una select
        toolbar={<UsersSortSelect value={params.sort} onChange={(sort) => setParams({ sort, page: 1 })} className="md:hidden" />}
      >
        {users.isPending ? (
          <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-14 w-full" />
            ))}
          </div>
        ) : users.isError ? (
          <div role="alert" className="grid justify-items-start gap-3 rounded-lg border p-6">
            <p>{t('users.loadError')}</p>
            <Button variant="outline" onClick={() => void users.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : users.data.data.length === 0 ? (
          <div className="grid justify-items-start gap-3 rounded-lg border p-6">
            <p>{t('users.empty')}</p>
            {/* Nome diverso da "Azzera filtri" del pannello: due pulsanti uguali confonderebbero */}
            {filtered && (
              <Button variant="outline" onClick={clearFilters}>
                {t('users.showAll')}
              </Button>
            )}
          </div>
        ) : (
          // Durante il caricamento della vista nuova restano i dati precedenti (keepPreviousData)
          <div aria-busy={users.isPlaceholderData || undefined}>
            <UsersTable list={users.data} sort={params.sort} page={params.page} perPage={params.perPage} onChange={setParams} renderActions={renderActions} />
          </div>
        )}
      </UserStatusTabs>
    </>
  )
}

export default UsersPage
