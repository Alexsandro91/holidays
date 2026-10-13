import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ManagedUser } from '@/features/users/api'
import RoleBadge from '@/features/users/components/RoleBadge'
import StatusBadge from '@/features/users/components/StatusBadge'

interface UsersTableProps {
  users: ManagedUser[]
  renderActions?: (user: ManagedUser) => ReactNode
}

/** Tabella su desktop, elenco di schede su mobile: le due viste sono entrambe nel DOM e si alternano via CSS. */
const UsersTable = ({ users, renderActions }: UsersTableProps) => {
  const { t, i18n } = useTranslation()
  // Istante di riferimento fissato al montaggio: il render resta puro
  const [now] = useState(() => Date.now())

  const details = (user: ManagedUser): string => {
    if (user.status !== 'invited' || user.invitation_expires_at === null) return ''
    const expires = new Date(user.invitation_expires_at)
    if (expires.getTime() <= now) return t('users.inviteExpired')
    return t('users.inviteExpires', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(expires) })
  }

  const person = (user: ManagedUser): ReactNode => (
    <div className="grid gap-0.5">
      <span className="flex flex-wrap items-center gap-2 font-semibold">
        {user.name}
        {user.is_current_user && <Badge variant="outline">{t('users.you')}</Badge>}
      </span>
      <span className="text-sm break-all text-muted-foreground">{user.email}</span>
    </div>
  )

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableCaption className="sr-only">{t('users.title')}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{t('users.columns.person')}</TableHead>
              <TableHead>{t('users.columns.role')}</TableHead>
              <TableHead>{t('users.columns.status')}</TableHead>
              <TableHead>{t('users.columns.details')}</TableHead>
              <TableHead>
                <span className="sr-only">{t('users.columns.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{person(user)}</TableCell>
                <TableCell>
                  <RoleBadge user={user} />
                </TableCell>
                <TableCell>
                  <StatusBadge user={user} />
                </TableCell>
                <TableCell className="text-muted-foreground">{details(user)}</TableCell>
                <TableCell className="text-right">{renderActions?.(user)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid gap-3 md:hidden">
        {users.map((user) => (
          <li key={user.id} className="grid gap-3 rounded-lg border p-4">
            {person(user)}
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge user={user} />
              <StatusBadge user={user} />
            </div>
            {details(user) !== '' && <p className="text-sm text-muted-foreground">{details(user)}</p>}
            {renderActions && <div className="flex justify-end">{renderActions(user)}</div>}
          </li>
        ))}
      </ul>
    </>
  )
}

export default UsersTable
