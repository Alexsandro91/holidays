import { X } from 'lucide-react'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { UserListParams } from '@/features/users/api'
import RoleFilter from '@/features/users/components/RoleFilter'
import TextFilter from '@/features/users/components/TextFilter'

interface UsersFiltersProps {
  params: UserListParams
  setParams: (next: Partial<UserListParams>, options?: { replace?: boolean }) => void
  onClear: () => void
}

/** Barra dei filtri: nome ed email con debounce (sostituiscono la voce della cronologia), ruolo e "Azzera filtri". */
const UsersFilters = ({ params, setParams, onClear }: UsersFiltersProps) => {
  const { t } = useTranslation()
  const commitName = useCallback((name: string) => setParams({ name, page: 1 }, { replace: true }), [setParams])
  const commitEmail = useCallback((email: string) => setParams({ email, page: 1 }, { replace: true }), [setParams])
  const filtered = params.name !== '' || params.email !== '' || params.role !== 'all' || params.status !== 'all'

  return (
    <div role="search" aria-label={t('users.filters.label')} className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,14rem)_auto] lg:items-end">
      <TextFilter id="users-filter-name" label={t('users.filters.name')} value={params.name} onCommit={commitName} />
      <TextFilter id="users-filter-email" label={t('users.filters.email')} value={params.email} onCommit={commitEmail} />
      <RoleFilter value={params.role} onChange={(role) => setParams({ role, page: 1 })} />
      {/* Solo con un filtro attivo: senza filtri il pulsante non farebbe nulla */}
      {filtered && (
        <Button variant="outline" onClick={onClear} className="justify-self-start">
          <X aria-hidden="true" />
          {t('users.clearFilters')}
        </Button>
      )}
    </div>
  )
}

export default UsersFilters
