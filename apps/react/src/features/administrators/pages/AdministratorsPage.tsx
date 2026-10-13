import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import PageHeading from '@/components/layout/PageHeading'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdministrators } from '@/features/administrators/api'
import GrantAdminDialog from '@/features/administrators/components/GrantAdminDialog'
import RevokeAdminDialog from '@/features/administrators/components/RevokeAdminDialog'
import { REVOKE_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'
import StatusBadge from '@/features/users/components/StatusBadge'
import type { ManagedUser } from '@/features/users/api'

const AdministratorsPage = () => {
  const { t } = useTranslation()
  const administrators = useAdministrators()
  const [revoking, setRevoking] = useState<ManagedUser | null>(null)
  const onlyYou = administrators.data !== undefined && administrators.data.length === 1 && administrators.data[0]?.is_current_user === true

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeading title={t('administrators.title')} description={t('administrators.subtitle')} />
        <GrantAdminDialog />
      </div>
      {onlyYou && (
        <Alert>
          <AlertDescription>{t('administrators.onlyYou')}</AlertDescription>
        </Alert>
      )}
      {administrators.isPending ? (
        <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-16 w-full" />
          ))}
        </div>
      ) : administrators.isError ? (
        <div role="alert" className="grid justify-items-start gap-3 rounded-lg border p-6">
          <p>{t('administrators.loadError')}</p>
          <Button variant="outline" onClick={() => void administrators.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <ul className="grid gap-2">
          {administrators.data.map((admin) => (
            <li key={admin.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
              <div className="min-w-0">
                <p className="font-medium break-words">{admin.name}</p>
                <p className="text-sm break-all text-muted-foreground">{admin.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge user={admin} />
                {admin.is_current_user && <Badge variant="outline">{t('users.you')}</Badge>}
                {!admin.is_current_user && (
                  <Button variant="outline" aria-label={t('administrators.revokeFor', { name: admin.name })} {...{ [REVOKE_TRIGGER_ATTRIBUTE]: admin.id }} onClick={() => setRevoking(admin)}>
                    {t('administrators.revoke')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <RevokeAdminDialog user={revoking} onClose={() => setRevoking(null)} />
    </>
  )
}

export default AdministratorsPage
