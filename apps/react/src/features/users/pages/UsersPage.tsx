import { useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useManagedUsers, type ManagedUser } from '@/features/users/api'
import UsersFilters from '@/features/users/components/UsersFilters'
import UsersSortSelect from '@/features/users/components/UsersSortSelect'
import UsersTable from '@/features/users/components/UsersTable'
import UserStatusTabs from '@/features/users/components/UserStatusTabs'
import { useUserListParams } from '@/features/users/useUserListParams'

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
  const users = useManagedUsers(params)

  // Pagina oltre l'ultima (es. dopo una disattivazione): si torna all'ultima disponibile
  const currentPage = users.data?.meta.current_page
  const lastPage = users.data?.meta.last_page
  useEffect(() => {
    if (currentPage !== undefined && lastPage !== undefined && lastPage >= 1 && currentPage > lastPage) setParams({ page: lastPage }, { replace: true })
  }, [currentPage, lastPage, setParams])

  const filtered = params.name !== '' || params.email !== '' || params.role !== 'all' || params.status !== 'all'

  const clearFilters = () => {
    setParams({ name: '', email: '', role: 'all', status: 'all', page: 1 })
    // Il pulsante sparisce senza filtri: il focus va al primo filtro invece di perdersi sul body
    document.getElementById('users-filter-name')?.focus()
  }

  return (
    <>
      {/* Lo spazio sotto è dell'intestazione: resta uguale anche quando il pulsante va a capo */}
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <PageHeading title={t('users.title')} description={t('users.subtitle')} className="mb-0" />
        {headerAction}
      </div>
      <UsersFilters params={params} setParams={setParams} onClear={clearFilters} />
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
            {filtered && (
              <Button variant="outline" onClick={clearFilters}>
                {t('users.clearFilters')}
              </Button>
            )}
          </div>
        ) : (
          // Durante il caricamento della vista nuova restano i dati precedenti (keepPreviousData)
          <div aria-busy={users.isPlaceholderData || undefined}>
            <UsersTable list={users.data} sort={params.sort} perPage={params.perPage} onChange={setParams} renderActions={renderActions} />
          </div>
        )}
      </UserStatusTabs>
    </>
  )
}

export default UsersPage
