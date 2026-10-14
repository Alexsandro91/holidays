import { functionalUpdate, useTable, type PaginationState, type SortingState } from '@tanstack/react-table'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { USER_PER_PAGE_OPTIONS, type ManagedUser, type UserList, type UserListParams, type UserPerPage, type UserSort } from '@/features/users/api'
import RoleBadge from '@/features/users/components/RoleBadge'
import SortableHeader from '@/features/users/components/SortableHeader'
import StatusBadge from '@/features/users/components/StatusBadge'
import UsersPagination from '@/features/users/components/UsersPagination'
import { isSortField } from '@/features/users/useUserListParams'
import { usersColumnHelper, usersTableFeatures } from '@/features/users/usersTableFeatures'

interface UsersTableProps {
  list: UserList
  sort: UserSort
  perPage: UserPerPage
  onChange: (next: Partial<UserListParams>) => void
  /** null per le righe senza azioni: nella scheda mobile non resta un contenitore vuoto */
  renderActions?: (user: ManagedUser) => ReactNode
}

const toSorting = (sort: UserSort): SortingState => [{ id: sort.startsWith('-') ? sort.slice(1) : sort, desc: sort.startsWith('-') }]

const toAriaSort = (sorted: false | 'asc' | 'desc'): 'ascending' | 'descending' | undefined =>
  sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined

/**
 * Data Table degli utenti (TanStack Table, ordinamento e paginazione manuali: li fa il server).
 * Tabella su desktop, schede su mobile: le due viste sono entrambe nel DOM e si alternano via CSS.
 */
const UsersTable = ({ list, sort, perPage, onChange, renderActions }: UsersTableProps) => {
  const { t, i18n } = useTranslation()
  // Istante di riferimento fissato al montaggio: il render resta puro
  const [now] = useState(() => Date.now())
  const sorting = useMemo(() => toSorting(sort), [sort])
  const pagination: PaginationState = useMemo(() => ({ pageIndex: list.meta.current_page - 1, pageSize: perPage }), [list.meta.current_page, perPage])

  const details = useCallback(
    (user: ManagedUser): string => {
      if (user.status !== 'invited') return ''
      // Invito senza scadenza: cancellato dalla pulizia degli inviti scaduti da oltre 30 giorni, va reinviato
      if (user.invitation_expires_at === null) return t('users.inviteExpired')
      const expires = new Date(user.invitation_expires_at)
      if (expires.getTime() <= now) return t('users.inviteExpired')
      return t('users.inviteExpires', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(expires) })
    },
    [t, i18n.language, now],
  )

  const columns = useMemo(
    () =>
      usersColumnHelper.columns([
        usersColumnHelper.accessor('name', {
          header: ({ column }) => <SortableHeader label={t('users.columns.name')} column={column} />,
          cell: ({ row }) => (
            <span className="flex flex-wrap items-center gap-2 font-semibold">
              {row.original.name}
              {row.original.is_current_user && <Badge variant="outline">{t('users.you')}</Badge>}
            </span>
          ),
        }),
        usersColumnHelper.accessor('email', {
          header: ({ column }) => <SortableHeader label={t('users.columns.email')} column={column} />,
          cell: ({ row }) => <span className="break-all text-muted-foreground">{row.original.email}</span>,
        }),
        usersColumnHelper.accessor('role', {
          header: ({ column }) => <SortableHeader label={t('users.columns.role')} column={column} />,
          cell: ({ row }) => <RoleBadge user={row.original} />,
        }),
        usersColumnHelper.accessor('status', {
          header: ({ column }) => <SortableHeader label={t('users.columns.status')} column={column} />,
          cell: ({ row }) => <StatusBadge user={row.original} />,
        }),
        usersColumnHelper.display({
          id: 'details',
          header: t('users.columns.details'),
          cell: ({ row }) => <span className="text-muted-foreground">{details(row.original)}</span>,
        }),
        usersColumnHelper.display({
          id: 'actions',
          header: () => <span className="sr-only">{t('users.columns.actions')}</span>,
          cell: ({ row }) => <div className="text-right">{renderActions?.(row.original)}</div>,
        }),
        ]),
    [t, details, renderActions],
  )

  const table = useTable({
    features: usersTableFeatures,
    columns,
    data: list.data,
    getRowId: (user) => String(user.id),
    state: { sorting, pagination },
    manualSorting: true,
    manualPagination: true,
    pageCount: list.meta.last_page,
    enableSortingRemoval: false,
    enableMultiSort: false,
    autoResetPageIndex: false,
    onSortingChange: (updater) => {
      const first = functionalUpdate(updater, sorting)[0]
      if (!first || !isSortField(first.id)) return
      // Nuovo ordinamento: si riparte dalla prima pagina
      onChange({ sort: first.desc ? `-${first.id}` : first.id, page: 1 })
    },
    onPaginationChange: (updater) => {
      const next = functionalUpdate(updater, pagination)
      const size = USER_PER_PAGE_OPTIONS.find((option) => option === next.pageSize)
      if (size !== undefined && size !== perPage) onChange({ perPage: size, page: 1 })
      else if (next.pageIndex !== pagination.pageIndex) onChange({ page: next.pageIndex + 1 })
    },
  })

  const rows = table.getRowModel().rows

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableCaption className="sr-only">{t('users.title')}</TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead key={header.id} aria-sort={header.column.getCanSort() ? toAriaSort(header.column.getIsSorted()) : undefined}>
                    {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id}>
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid gap-3 md:hidden">
        {rows.map(({ original: user }) => {
          const actions = renderActions?.(user)
          const detail = details(user)
          return (
            <li key={user.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg border p-4">
              <div className="grid gap-3">
                <div className="grid gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {user.name}
                    {user.is_current_user && <Badge variant="outline">{t('users.you')}</Badge>}
                  </span>
                  <span className="text-sm break-all text-muted-foreground">{user.email}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <RoleBadge user={user} />
                  <StatusBadge user={user} />
                </div>
                {/* Dettagli solo se ci sono: nella griglia un contenitore vuoto lascerebbe uno spazio */}
                {detail !== '' && <p className="text-sm text-muted-foreground">{detail}</p>}
              </div>
              {/* Menu in alto a destra, accanto al nome: niente riga dedicata in fondo alla scheda */}
              {actions != null && <div className="-mt-2 -mr-2">{actions}</div>}
            </li>
          )
        })}
      </ul>
      <UsersPagination table={table} page={list.meta.current_page} lastPage={list.meta.last_page} total={list.meta.total} />
    </>
  )
}

export default UsersTable
