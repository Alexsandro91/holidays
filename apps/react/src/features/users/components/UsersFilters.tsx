import { SlidersHorizontal, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { UserListParams } from '@/features/users/api'
import EmploymentTypeFilter from '@/features/users/components/EmploymentTypeFilter'
import LocationFilter from '@/features/users/components/LocationFilter'
import RoleFilter from '@/features/users/components/RoleFilter'
import TextFilter from '@/features/users/components/TextFilter'
import type { TextFilterField } from '@/features/users/useTextDrafts'
import { countPanelFilters, hasAnyFilter } from '@/features/users/useUserListParams'

interface UsersFiltersProps {
  params: UserListParams
  setParams: (next: Partial<UserListParams>, options?: { replace?: boolean }) => void
  onClear: () => void
  /** Testi in sospeso (vedi useTextDrafts) */
  onDraft: (field: TextFilterField, value: string) => void
  resetKey: number
  /** Filtro per sede: solo admin con più sedi */
  withLocation: boolean
}

/**
 * Ricerca generale sempre visibile e pulsante "Filtri" che apre il pannello con nome, cognome, email, ruolo, tipo di
 * rapporto, sede (solo admin con più sedi) e "Azzera filtri" (spec §7.2). Il pannello si apre da solo quando l'URL ha filtri del pannello attivi.
 */
const UsersFilters = ({ params, setParams, onClear, onDraft, resetKey, withLocation }: UsersFiltersProps) => {
  const { t } = useTranslation()
  const active = countPanelFilters(params)
  const [open, setOpen] = useState(active > 0)
  // Filtri comparsi da fuori (link, Indietro): il pannello si apre, durante il render e senza effect
  const [hadFilters, setHadFilters] = useState(active > 0)
  if (hadFilters !== active > 0) {
    setHadFilters(active > 0)
    if (active > 0) setOpen(true)
  }

  // I testi aggiornano l'URL con replace: ogni battuta non diventa una voce della cronologia
  const commitSearch = useCallback((search: string) => setParams({ search, page: 1 }, { replace: true }), [setParams])
  const commitFirstName = useCallback((firstName: string) => setParams({ firstName, page: 1 }, { replace: true }), [setParams])
  const commitLastName = useCallback((lastName: string) => setParams({ lastName, page: 1 }, { replace: true }), [setParams])
  const commitEmail = useCallback((email: string) => setParams({ email, page: 1 }, { replace: true }), [setParams])

  return (
    <div role="search" aria-label={t('users.filters.label')} className="mb-5 grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <TextFilter
          id="users-search"
          label={t('users.filters.search')}
          placeholder={t('users.filters.searchPlaceholder')}
          value={params.search}
          onCommit={commitSearch}
          onDraft={(value) => onDraft('search', value)}
          resetKey={resetKey}
          className="min-w-0 flex-1 basis-60 sm:max-w-md"
        />
        {/* Con filtri attivi il nome accessibile è "Filtri: 2 filtri attivi" (aria-label: un testo sr-only accanto al
            numero lascerebbe uno spazio prima dei due punti); inizia con il testo visibile, come chiede WCAG 2.5.3 */}
        <Button
          variant="outline"
          aria-expanded={open}
          aria-controls="users-filters-panel"
          aria-label={active > 0 ? `${t('users.filters.toggle')}: ${t('users.filters.activeCount', { count: active })}` : undefined}
          onClick={() => setOpen(!open)}
        >
          <SlidersHorizontal aria-hidden="true" />
          {t('users.filters.toggle')}
          {active > 0 && (
            <span aria-hidden="true" className="rounded-full bg-primary px-1.5 text-xs leading-5 font-semibold text-primary-foreground tabular-nums">
              {active}
            </span>
          )}
        </Button>
      </div>
      {/* Sempre nel DOM (hidden quando è chiuso): aria-controls punta a un elemento che esiste e i campi non perdono lo stato */}
      <div id="users-filters-panel" hidden={!open} className="rounded-lg border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:items-end">
          <TextFilter
            id="users-filter-first-name"
            label={t('users.filters.firstName')}
            value={params.firstName}
            onCommit={commitFirstName}
            onDraft={(value) => onDraft('firstName', value)}
            resetKey={resetKey}
          />
          <TextFilter
            id="users-filter-last-name"
            label={t('users.filters.lastName')}
            value={params.lastName}
            onCommit={commitLastName}
            onDraft={(value) => onDraft('lastName', value)}
            resetKey={resetKey}
          />
          <TextFilter
            id="users-filter-email"
            label={t('users.filters.email')}
            value={params.email}
            onCommit={commitEmail}
            onDraft={(value) => onDraft('email', value)}
            resetKey={resetKey}
          />
          <RoleFilter value={params.role} onChange={(role) => setParams({ role, page: 1 })} />
          <EmploymentTypeFilter value={params.employmentType} onChange={(employmentType) => setParams({ employmentType, page: 1 })} />
          {withLocation && <LocationFilter value={params.location} onChange={(location) => setParams({ location, page: 1 })} />}
        </div>
        {/* Solo con un filtro attivo: senza filtri il pulsante non farebbe nulla */}
        {hasAnyFilter(params) && (
          <Button variant="outline" onClick={onClear} className="mt-3">
            <X aria-hidden="true" />
            {t('users.clearFilters')}
          </Button>
        )}
      </div>
    </div>
  )
}

export default UsersFilters
