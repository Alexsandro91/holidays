import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EMPLOYMENT_TYPES } from '@/features/auth/api'
import type { EmploymentTypeFilter as EmploymentTypeFilterValue } from '@/features/users/api'
import { isEmploymentTypeFilter } from '@/features/users/useUserListParams'

const OPTIONS: EmploymentTypeFilterValue[] = ['all', ...EMPLOYMENT_TYPES]

interface EmploymentTypeFilterProps {
  value: EmploymentTypeFilterValue
  onChange: (type: EmploymentTypeFilterValue) => void
}

/** Select del tipo di rapporto: "Tutti i tipi" toglie il filtro. */
const EmploymentTypeFilter = ({ value, onChange }: EmploymentTypeFilterProps) => {
  const { t } = useTranslation()
  return (
    <div className="grid gap-2">
      <Label id="users-filter-employment-type-label" htmlFor="users-filter-employment-type">
        {t('users.filters.employmentType')}
      </Label>
      <Select value={value} onValueChange={(next) => isEmploymentTypeFilter(next) && onChange(next)}>
        <SelectTrigger id="users-filter-employment-type" aria-labelledby="users-filter-employment-type-label" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {OPTIONS.map((type) => (
            <SelectItem key={type} value={type}>
              {type === 'all' ? t('users.filters.allEmploymentTypes') : t(`users.employmentTypes.${type}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default EmploymentTypeFilter
