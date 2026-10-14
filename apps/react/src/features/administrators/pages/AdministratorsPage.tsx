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
import ConfirmUserActionDialog from '@/features/users/components/ConfirmUserActionDialog'
import EditUserDialog from '@/features/users/components/EditUserDialog'
import StatusBadge from '@/features/users/components/StatusBadge'
import type { ManagedUser } from '@/features/users/api'
import { useInvitationDetail } from '@/features/users/useInvitationDetail'
import { INVITATION_TRIGGER_ATTRIBUTE, REVOKE_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

/** Valore dell'attributo di focus di un pulsante dell'invito: uno per azione, così il focus torna su quello giusto */
const invitationTriggerKey = (user: ManagedUser, action: string): string => `${user.id}-${action}`

const AdministratorsPage = () => {
  const { t } = useTranslation()
  const administrators = useAdministrators()
  const [revoking, setRevoking] = useState<ManagedUser | null>(null)
  // Reinvio o annullamento dell'invito di un admin non ancora attivo (endpoint di /api/users, spec §4)
  const [invitation, setInvitation] = useState<{ user: ManagedUser; action: 'resend' | 'cancel' } | null>(null)
  const [editing, setEditing] = useState<ManagedUser | null>(null)
  const invitationDetail = useInvitationDetail()
  // Contano solo gli admin attivi: uno disattivato non può subentrare
  const activeAdmins = administrators.data?.filter((admin) => admin.status === 'active')
  const onlyYou = activeAdmins !== undefined && activeAdmins.length === 1 && activeAdmins[0]?.is_current_user === true

  return (
    <>
      {/* Lo spazio sotto è dell'intestazione: resta uguale anche quando il pulsante va a capo */}
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <PageHeading title={t('administrators.title')} description={t('administrators.subtitle')} className="mb-0" />
        <GrantAdminDialog />
      </div>
      {/* Avviso e lista con il loro spazio: l'avviso non si attacca alla lista */}
      <div className="grid gap-4">
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
            {administrators.data.map((admin) => {
              const detail = invitationDetail(admin)
              return (
                <li key={admin.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{admin.name}</p>
                    <p className="text-sm break-all text-muted-foreground">{admin.email}</p>
                    {detail !== '' && <p className="text-sm text-muted-foreground">{detail}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge user={admin} />
                    {admin.is_current_user && <Badge variant="outline">{t('users.you')}</Badge>}
                    {admin.status === 'invited' ? (
                      // Admin invitato: non si revoca, si gestisce l'invito (Reinvia, Modifica, Annulla) secondo i permessi
                      // del server. Ogni pulsante ha il suo valore di attributo: il focus torna su quello che ha aperto il dialog
                      <>
                        {admin.can.resend_invitation && (
                          <Button
                            variant="outline"
                            aria-label={t('administrators.resendFor', { name: admin.name })}
                            {...{ [INVITATION_TRIGGER_ATTRIBUTE]: invitationTriggerKey(admin, 'resend') }}
                            onClick={() => setInvitation({ user: admin, action: 'resend' })}
                          >
                            {t('administrators.resend')}
                          </Button>
                        )}
                        {admin.can.update && (
                          <Button
                            variant="outline"
                            aria-label={t('administrators.editFor', { name: admin.name })}
                            {...{ [INVITATION_TRIGGER_ATTRIBUTE]: invitationTriggerKey(admin, 'edit') }}
                            onClick={() => setEditing(admin)}
                          >
                            {t('administrators.edit')}
                          </Button>
                        )}
                        {admin.can.cancel_invitation && (
                          <Button
                            variant="outline"
                            aria-label={t('administrators.cancelFor', { name: admin.name })}
                            {...{ [INVITATION_TRIGGER_ATTRIBUTE]: invitationTriggerKey(admin, 'cancel') }}
                            onClick={() => setInvitation({ user: admin, action: 'cancel' })}
                          >
                            {t('administrators.cancel')}
                          </Button>
                        )}
                      </>
                    ) : (
                      // Revoca solo degli admin attivi: per gli altri il server risponde 409 (spec §7.5)
                      admin.status === 'active' &&
                      !admin.is_current_user && (
                        <Button variant="outline" aria-label={t('administrators.revokeFor', { name: admin.name })} {...{ [REVOKE_TRIGGER_ATTRIBUTE]: admin.id }} onClick={() => setRevoking(admin)}>
                          {t('administrators.revoke')}
                        </Button>
                      )
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      <RevokeAdminDialog user={revoking} onClose={() => setRevoking(null)} />
      <ConfirmUserActionDialog
        user={invitation?.user ?? null}
        action={invitation?.action ?? null}
        onClose={() => setInvitation(null)}
        triggerAttribute={INVITATION_TRIGGER_ATTRIBUTE}
        triggerKey={invitationTriggerKey}
      />
      <EditUserDialog
        user={editing}
        onClose={() => setEditing(null)}
        triggerAttribute={INVITATION_TRIGGER_ATTRIBUTE}
        triggerKey={(user) => invitationTriggerKey(user, 'edit')}
      />
    </>
  )
}

export default AdministratorsPage
