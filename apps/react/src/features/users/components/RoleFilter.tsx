import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { UserRoleFilter } from '@/features/users/api'
import { isRoleFilter } from '@/features/users/useUserListParams'

const ROLES: UserRoleFilter[] = ['all', 'employee', 'manager']

interface RoleFilterProps {
  value: UserRoleFilter
  onChange: (role: UserRoleFilter) => void
}

/** Select del ruolo: "Tutti i ruoli" toglie il filtro. */
const RoleFilter = ({ value, onChange }: RoleFilterProps) => {
  const { t } = useTranslation()
  return (
    <div className="grid gap-2">
      <Label id="users-filter-role-label" htmlFor="users-filter-role">{t('users.filters.role')}</Label>
      <Select value={value} onValueChange={(next) => isRoleFilter(next) && onChange(next)}>
        <SelectTrigger id="users-filter-role" aria-labelledby="users-filter-role-label" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {role === 'all' ? t('users.filters.allRoles') : t(`users.roles.${role}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default RoleFilter
