import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { UserSort } from '@/features/users/api'
import { isUserSort, USER_SORT_FIELDS } from '@/features/users/useUserListParams'
import { cn } from '@/lib/utils'

// Ogni campo in ordine crescente e decrescente, come le intestazioni della tabella
const OPTIONS: UserSort[] = USER_SORT_FIELDS.flatMap((field): UserSort[] => [field, `-${field}`])

interface UsersSortSelectProps {
  value: UserSort
  onChange: (sort: UserSort) => void
  className?: string
}

/** "Ordina per" della vista a schede: su mobile non ci sono intestazioni da cliccare. */
const UsersSortSelect = ({ value, onChange, className }: UsersSortSelectProps) => {
  const { t } = useTranslation()
  return (
    <div className={cn('grid gap-2', className)}>
      <Label id="users-sort-label" htmlFor="users-sort">{t('users.sort.label')}</Label>
      <Select value={value} onValueChange={(next) => isUserSort(next) && onChange(next)}>
        <SelectTrigger id="users-sort" aria-labelledby="users-sort-label" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {OPTIONS.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`users.sort.${option}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default UsersSortSelect
