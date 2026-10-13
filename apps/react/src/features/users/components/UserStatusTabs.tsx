import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { UserList, UserStatusFilter } from '@/features/users/api'

interface UserStatusTabsProps {
  value: UserStatusFilter
  counts: UserList['meta']['counts'] | undefined
  onChange: (status: UserStatusFilter) => void
}

const FILTERS: UserStatusFilter[] = ['all', 'active', 'invited', 'disabled']

const isFilter = (value: string): value is UserStatusFilter => FILTERS.some((filter) => filter === value)

/** Schede per stato con il conteggio (calcolato con la ricerca corrente). */
const UserStatusTabs = ({ value, counts, onChange }: UserStatusTabsProps) => {
  const { t } = useTranslation()
  return (
    <Tabs value={value} onValueChange={(next) => isFilter(next) && onChange(next)}>
      <TabsList aria-label={t('users.tabs.label')} className="max-w-full flex-wrap">
        {FILTERS.map((filter) => (
          // nessun pannello associato: la lista sotto cambia con il filtro, quindi niente aria-controls verso id inesistenti
          <TabsTrigger key={filter} value={filter} aria-controls={undefined} className="gap-1.5">
            {t(`users.tabs.${filter}`)}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{counts?.[filter] ?? 0}</span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

export default UserStatusTabs
