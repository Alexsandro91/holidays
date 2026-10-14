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

/** Valore dell'attributo di focus di un pulsante di riga: uno per azione, così il focus torna su quello giusto */
const invitationTriggerKey = (user: ManagedUser, action: string): string => `${user.id}-${action}`

type ConfirmedAction = 'resend' | 'cancel' | 'disable' | 'enable'

const AdministratorsPage = () => {
  const { t } = useTranslation()
  const administrators = useAdministrators()
  const [revoking, setRevoking] = useState<ManagedUser | null>(null)
  // Azioni con conferma sugli endpoint di /api/users: invito di un admin non ancora attivo (spec §4), disattivazione
  // e riattivazione senza togliere il ruolo (spec §7.6, con la password come nella fase 3)
  const [confirming, setConfirming] = useState<{ user: ManagedUser; action: ConfirmedAction } | null>(null)
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
                            onClick={() => setConfirming({ user: admin, action: 'resend' })}
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
                            onClick={() => setConfirming({ user: admin, action: 'cancel' })}
                          >
                            {t('administrators.cancel')}
                          </Button>
                        )}
                      </>
                    ) : admin.status === 'active' ? (
                      // Revoca solo degli admin attivi: per gli altri il server risponde 409 (spec §7.5). Disattivare
                      // lascia il ruolo: l'admin resta in questa pagina e si può riattivare (spec §7.6)
                      !admin.is_current_user && (
                        <>
                          <Button variant="outline" aria-label={t('administrators.revokeFor', { name: admin.name })} {...{ [REVOKE_TRIGGER_ATTRIBUTE]: admin.id }} onClick={() => setRevoking(admin)}>
                            {t('administrators.revoke')}
                          </Button>
                          {admin.can.disable && (
                            <Button
                              variant="outline"
                              className="text-danger-soft-foreground hover:bg-danger-soft hover:text-danger-soft-foreground"
                              aria-label={t('administrators.disableFor', { name: admin.name })}
                              {...{ [INVITATION_TRIGGER_ATTRIBUTE]: invitationTriggerKey(admin, 'disable') }}
                              onClick={() => setConfirming({ user: admin, action: 'disable' })}
                            >
                              {t('administrators.disable')}
                            </Button>
                          )}
                        </>
                      )
                    ) : (
                      admin.can.enable && (
                        <Button
                          variant="outline"
                          aria-label={t('administrators.enableFor', { name: admin.name })}
                          {...{ [INVITATION_TRIGGER_ATTRIBUTE]: invitationTriggerKey(admin, 'enable') }}
                          onClick={() => setConfirming({ user: admin, action: 'enable' })}
                        >
                          {t('administrators.enable')}
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
        user={confirming?.user ?? null}
        action={confirming?.action ?? null}
        onClose={() => setConfirming(null)}
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
