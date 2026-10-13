import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

interface UsersPaginationProps {
  page: number
  lastPage: number
  onChange: (page: number) => void
}

const UsersPagination = ({ page, lastPage, onChange }: UsersPaginationProps) => {
  const { t } = useTranslation()
  if (lastPage <= 1) return null

  return (
    <nav aria-label={t('users.pagination.label')} className="mt-4 flex items-center justify-between gap-3">
      <Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        {t('users.pagination.previous')}
      </Button>
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {t('users.pagination.status', { page, pages: lastPage })}
      </p>
      <Button variant="outline" disabled={page >= lastPage} onClick={() => onChange(page + 1)}>
        {t('users.pagination.next')}
      </Button>
    </nav>
  )
}

export default UsersPagination
