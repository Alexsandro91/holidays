import { Search } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useManagedUsers, type ManagedUser } from '@/features/users/api'
import UserStatusTabs from '@/features/users/components/UserStatusTabs'
import UsersPagination from '@/features/users/components/UsersPagination'
import UsersTable from '@/features/users/components/UsersTable'
import { useUserListParams } from '@/features/users/useUserListParams'

const SEARCH_DEBOUNCE_MS = 300

interface UsersPageProps {
  /** Pulsante "Invita utente" (Task 10) */
  headerAction?: ReactNode
  /** Menu azioni per riga (Task 10) */
  renderActions?: (user: ManagedUser) => ReactNode
}

const UsersPage = ({ headerAction, renderActions }: UsersPageProps) => {
  const { t } = useTranslation()
  const { params, setParams } = useUserListParams()
  const [draft, setDraft] = useState(params.search)
  const users = useManagedUsers(params)

  // Il campo segue l'URL (indietro, link condivisi): si riallinea durante il render, senza effect
  const [syncedSearch, setSyncedSearch] = useState(params.search)
  if (syncedSearch !== params.search) {
    setSyncedSearch(params.search)
    setDraft(params.search)
  }

  // Pagina oltre l'ultima (es. dopo una disattivazione): si torna all'ultima disponibile
  const currentPage = users.data?.meta.current_page
  const lastPage = users.data?.meta.last_page
  useEffect(() => {
    if (currentPage !== undefined && lastPage !== undefined && lastPage >= 1 && currentPage > lastPage) setParams({ page: lastPage }, { replace: true })
  }, [currentPage, lastPage, setParams])

  // Ricerca aggiornata 300 ms dopo l'ultima battuta; si torna a pagina 1
  useEffect(() => {
    if (draft === params.search) return
    const id = window.setTimeout(() => setParams({ search: draft, page: 1 }, { replace: true }), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [draft, params.search, setParams])

  const clearFilters = () => {
    setDraft('')
    setParams({ status: 'all', search: '', page: 1 })
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading title={t('users.title')} description={t('users.subtitle')} />
        {headerAction}
      </div>
      <UserStatusTabs
        value={params.status}
        counts={users.data?.meta.counts}
        onChange={(status) => setParams({ status, page: 1 })}
        toolbar={
          <div className="relative md:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input type="search" aria-label={t('users.search')} placeholder={t('users.search')} value={draft} onChange={(event) => setDraft(event.target.value)} className="pl-9" />
          </div>
        }
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
            <Button variant="outline" onClick={clearFilters}>
              {t('users.clearFilters')}
            </Button>
          </div>
        ) : (
          <>
            <UsersTable users={users.data.data} renderActions={renderActions} />
            <UsersPagination page={users.data.meta.current_page} lastPage={users.data.meta.last_page} onChange={(page) => setParams({ page })} />
          </>
        )}
      </UserStatusTabs>
    </>
  )
}

export default UsersPage
