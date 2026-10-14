import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { USER_PER_PAGE_OPTIONS } from '@/features/users/api'
import type { UsersTableInstance } from '@/features/users/usersTableFeatures'

interface UsersPaginationProps {
  table: UsersTableInstance
  page: number
  lastPage: number
  total: number
}

/** Paginazione della Data Table: prima, precedente, successiva, ultima, righe per pagina e totale. */
const UsersPagination = ({ table, page, lastPage, total }: UsersPaginationProps) => {
  const { t } = useTranslation()
  const pageSize = String(table.state.pagination.pageSize)

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p className="text-sm text-muted-foreground">{t('users.pagination.total', { count: total })}</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <Label id="users-per-page-label" htmlFor="users-per-page" className="font-normal text-muted-foreground">
            {t('users.pagination.perPage')}
          </Label>
          <Select value={pageSize} onValueChange={(value) => table.setPageSize(Number(value))}>
            <SelectTrigger id="users-per-page" aria-labelledby="users-per-page-label" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {USER_PER_PAGE_OPTIONS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <nav aria-label={t('users.pagination.label')} className="flex items-center gap-1">
          <p aria-live="polite" className="mr-2 text-sm whitespace-nowrap">
            {t('users.pagination.status', { page, pages: lastPage })}
          </p>
          <Button variant="outline" size="icon" disabled={!table.getCanPreviousPage()} onClick={() => table.firstPage()} aria-label={t('users.pagination.first')}>
            <ChevronFirst aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()} aria-label={t('users.pagination.previous')}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()} aria-label={t('users.pagination.next')}>
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" disabled={!table.getCanNextPage()} onClick={() => table.lastPage()} aria-label={t('users.pagination.last')}>
            <ChevronLast aria-hidden="true" />
          </Button>
        </nav>
      </div>
    </div>
  )
}

export default UsersPagination
