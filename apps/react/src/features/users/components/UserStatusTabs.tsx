import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { UserList, UserStatusFilter } from '@/features/users/api'

interface UserStatusTabsProps {
  value: UserStatusFilter
  counts: UserList['meta']['counts'] | undefined
  onChange: (status: UserStatusFilter) => void
  /** Controlli accanto alle schede (ricerca) */
  toolbar?: ReactNode
  /** Risultati: finiscono nel pannello della scheda attiva */
  children: ReactNode
}

const FILTERS: UserStatusFilter[] = ['all', 'active', 'invited', 'disabled']

const isFilter = (value: string): value is UserStatusFilter => FILTERS.some((filter) => filter === value)

/** Schede per stato con il conteggio (calcolato con la ricerca corrente). */
const UserStatusTabs = ({ value, counts, onChange, toolbar, children }: UserStatusTabsProps) => {
  const { t } = useTranslation()
  return (
    <Tabs value={value} onValueChange={(next) => isFilter(next) && onChange(next)}>
      <div className="grid gap-3 md:flex md:items-center md:justify-between">
        {/* a 360 px le schede vanno a capo: lista ad altezza libera e schede compatte */}
        <TabsList aria-label={t('users.tabs.label')} className="group-data-horizontal/tabs:h-auto max-w-full flex-wrap justify-start">
          {FILTERS.map((filter) => (
            <TabsTrigger key={filter} value={filter} className="h-7 flex-none gap-1.5">
              {t(`users.tabs.${filter}`)}
              <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{counts?.[filter] ?? 0}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {toolbar}
      </div>
      <TabsContent value={value}>{children}</TabsContent>
    </Tabs>
  )
}

export default UserStatusTabs
