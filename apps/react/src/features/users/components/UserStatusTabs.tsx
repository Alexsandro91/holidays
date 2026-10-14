import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { UserList, UserStatusFilter } from '@/features/users/api'

interface UserStatusTabsProps {
  value: UserStatusFilter
  counts: UserList['meta']['counts'] | undefined
  onChange: (status: UserStatusFilter) => void
  /** Controlli accanto alle schede (l'ordinamento della vista a schede) */
  toolbar?: ReactNode
  /** Risultati: finiscono nel pannello della scheda attiva */
  children: ReactNode
}

const FILTERS: UserStatusFilter[] = ['all', 'active', 'invited', 'disabled']

const isFilter = (value: string): value is UserStatusFilter => FILTERS.some((filter) => filter === value)

/** Schede per stato con il conteggio (calcolato con i filtri di nome, email e ruolo correnti). */
const UserStatusTabs = ({ value, counts, onChange, toolbar, children }: UserStatusTabsProps) => {
  const { t } = useTranslation()
  return (
    <Tabs value={value} onValueChange={(next) => isFilter(next) && onChange(next)}>
      <div className="grid gap-3 md:flex md:items-center md:justify-between">
        {/* a 360 px le schede vanno a capo: lista ad altezza libera e schede compatte */}
        <TabsList aria-label={t('users.tabs.label')} className="group-data-horizontal/tabs:h-auto max-w-full flex-wrap justify-start">
          {FILTERS.map((filter) => (
            // text-muted-foreground: 5,7:1 in chiaro e 6,9:1 in scuro su bg-muted (text-foreground/60 era 4,2:1)
            <TabsTrigger key={filter} value={filter} className="h-7 flex-none gap-1.5 text-muted-foreground">
              {t(`users.tabs.${filter}`)}
              {/* Niente "0" finto durante il primo caricamento */}
              {counts !== undefined && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{counts[filter]}</span>}
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
