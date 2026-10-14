import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ManagedUser } from '@/features/users/api'
import RoleBadge from '@/features/users/components/RoleBadge'
import StatusBadge from '@/features/users/components/StatusBadge'

interface UsersTableProps {
  users: ManagedUser[]
  /** null per le righe senza azioni: nella scheda mobile non resta un contenitore vuoto */
  renderActions?: (user: ManagedUser) => ReactNode
}

/** Tabella su desktop, elenco di schede su mobile: le due viste sono entrambe nel DOM e si alternano via CSS. */
const UsersTable = ({ users, renderActions }: UsersTableProps) => {
  const { t, i18n } = useTranslation()
  // Istante di riferimento fissato al montaggio: il render resta puro
  const [now] = useState(() => Date.now())

  const details = (user: ManagedUser): string => {
    if (user.status !== 'invited') return ''
    // Invito senza scadenza: cancellato dalla pulizia degli inviti scaduti da oltre 30 giorni, va reinviato
    if (user.invitation_expires_at === null) return t('users.inviteExpired')
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
        {users.map((user) => {
          const detail = details(user)
          const actions = renderActions?.(user)
          return (
            <li key={user.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg border p-4">
              <div className="grid gap-3">
                {person(user)}
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
    </>
  )
}

export default UsersTable
