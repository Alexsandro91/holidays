import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BALANCE_TYPES, type BalanceOverviewRow, type BalanceOverviewSort } from '@/features/balances/api'
import BalanceCell from '@/features/balances/components/BalanceCell'
import BalanceRowActions, { type BalanceRowAction } from '@/features/balances/components/BalanceRowActions'
import { formatNumericDate } from '@/features/balances/describeMovement'
import { formatHours } from '@/features/balances/hoursFormat'
import SortableHeader from '@/features/users/components/SortableHeader'
import { USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface BalancesTableProps {
  rows: BalanceOverviewRow[]
  sort: BalanceOverviewSort
  /** Pagina dell'URL, non della risposta: con i dati precedenti ancora a schermo i clic ravvicinati non si perdono */
  page: number
  lastPage: number
  total: number
  /** Colonna Sede: solo admin con più sedi */
  withLocation: boolean
  onSort: (sort: BalanceOverviewSort) => void
  onPage: (page: number) => void
  onAction: (row: BalanceOverviewRow, action: BalanceRowAction) => void
}

type SortField = 'name' | 'location'

/** Adattatore per SortableHeader: prima crescente, poi alterna. */
const sortColumn = (field: SortField, sort: BalanceOverviewSort, onSort: (sort: BalanceOverviewSort) => void) => {
  const sorted: false | 'asc' | 'desc' = sort === field ? 'asc' : sort === `-${field}` ? 'desc' : false
  return {
    sorted,
    column: { getIsSorted: () => sorted, toggleSorting: (desc?: boolean) => onSort(desc === true ? `-${field}` : field) },
  }
}

const toAriaSort = (sorted: false | 'asc' | 'desc'): 'ascending' | 'descending' | undefined =>
  sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined

/** Tabella dei saldi su desktop, schede su mobile: le due viste sono nel DOM e si alternano via CSS. */
const BalancesTable = ({ rows, sort, page, lastPage, total, withLocation, onSort, onPage, onAction }: BalancesTableProps) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const name = sortColumn('name', sort, onSort)
  const location = sortColumn('location', sort, onSort)
  const labels = { vacation: t('balances.page.types.vacation'), rol: t('balances.page.types.rol'), ex_holidays: t('balances.page.types.ex_holidays') }

  const nameButton = (row: BalanceOverviewRow) => (
    <Button variant="link" className="h-auto justify-start p-0 text-left font-semibold whitespace-normal" onClick={() => onAction(row, 'open')} {...{ [USER_TRIGGER_ATTRIBUTE]: row.user.id }}>
      {row.user.name}
    </Button>
  )

  const subtitle = (row: BalanceOverviewRow) => (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      <span>{t('balances.page.roleWeekly', { role: row.user.role_label, hours: formatHours(row.weekly_minutes, locale) })}</span>
      {row.weekly_minutes < row.location_weekly_minutes && <Badge variant="outline">{t('balances.page.partTime')}</Badge>}
    </span>
  )

  const lastAligned = (row: BalanceOverviewRow) =>
    row.last_aligned_on === null ? <Badge variant="secondary">{t('balances.page.never')}</Badge> : formatNumericDate(row.last_aligned_on, locale)

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableCaption className="sr-only">{t('balances.title')}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead aria-sort={toAriaSort(name.sorted)}>
                <SortableHeader label={t('balances.page.columns.person')} column={name.column} />
              </TableHead>
              {withLocation && (
                <TableHead aria-sort={toAriaSort(location.sorted)}>
                  <SortableHeader label={t('balances.page.columns.location')} column={location.column} />
                </TableHead>
              )}
              <TableHead>{labels.vacation}</TableHead>
              <TableHead>{labels.rol}</TableHead>
              <TableHead>{labels.ex_holidays}</TableHead>
              <TableHead>{t('balances.page.columns.lastAligned')}</TableHead>
              <TableHead>
                <span className="sr-only">{t('balances.page.columns.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.user.id}>
                <TableCell>
                  <div className="grid gap-0.5">
                    {nameButton(row)}
                    {subtitle(row)}
                  </div>
                </TableCell>
                {withLocation && <TableCell>{row.user.location?.name}</TableCell>}
                <TableCell>
                  <BalanceCell label={labels.vacation} currentMinutes={row.balances.vacation.current_minutes} annualMinutes={row.balances.vacation.annual_minutes} averageDayMinutes={row.average_day_minutes} />
                </TableCell>
                <TableCell>
                  <BalanceCell label={labels.rol} currentMinutes={row.balances.rol.current_minutes} annualMinutes={row.balances.rol.annual_minutes} />
                </TableCell>
                <TableCell>
                  <BalanceCell label={labels.ex_holidays} currentMinutes={row.balances.ex_holidays.current_minutes} annualMinutes={row.balances.ex_holidays.annual_minutes} />
                </TableCell>
                <TableCell>{lastAligned(row)}</TableCell>
                <TableCell className="text-right">
                  <BalanceRowActions row={row} onSelect={(action) => onAction(row, action)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid gap-3 md:hidden">
        {rows.map((row) => (
          <li key={row.user.id} className="grid gap-3 rounded-lg border p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
              <div className="grid gap-0.5">
                {nameButton(row)}
                {subtitle(row)}
                {withLocation && row.user.location !== null && <span className="text-sm text-muted-foreground">{row.user.location.name}</span>}
              </div>
              <div className="-mt-2 -mr-2">
                <BalanceRowActions row={row} onSelect={(action) => onAction(row, action)} />
              </div>
            </div>
            <dl className="grid gap-3 sm:grid-cols-3">
              {BALANCE_TYPES.map((type) => (
                <div key={type} className="grid gap-1">
                  <dt className="text-sm text-muted-foreground">{labels[type]}</dt>
                  <dd>
                    <BalanceCell
                      label={labels[type]}
                      currentMinutes={row.balances[type].current_minutes}
                      annualMinutes={row.balances[type].annual_minutes}
                      averageDayMinutes={type === 'vacation' ? row.average_day_minutes : undefined}
                    />
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-muted-foreground">
              {t('balances.page.columns.lastAligned')}: {lastAligned(row)}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="text-sm text-muted-foreground">{t('balances.page.total', { count: total })}</p>
        <nav aria-label={t('balances.page.pagination.label')} className="flex items-center gap-1">
          <p aria-live="polite" className="mr-2 text-sm whitespace-nowrap">
            {t('balances.page.pagination.status', { page, pages: lastPage })}
          </p>
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('balances.page.pagination.previous')}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" disabled={page >= lastPage} onClick={() => onPage(page + 1)} aria-label={t('balances.page.pagination.next')}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      </div>
    </>
  )
}

export default BalancesTable
