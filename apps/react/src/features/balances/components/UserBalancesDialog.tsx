import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useUserBalanceMovements, useUserBalances, type BalanceType } from '@/features/balances/api'
import { formatNumericDate } from '@/features/balances/describeMovement'
import AdjustBalanceDialog from '@/features/balances/components/AdjustBalanceDialog'
import AlignBalancesDialog from '@/features/balances/components/AlignBalancesDialog'
import BalanceCards from '@/features/balances/components/BalanceCards'
import BalanceMovementsSection from '@/features/balances/components/BalanceMovementsSection'
import BalanceYearSelect from '@/features/balances/components/BalanceYearSelect'
import UserAccrualSection from '@/features/balances/components/UserAccrualSection'
import { formatHours } from '@/features/balances/hoursFormat'
import { isApiError } from '@/lib/api'
import { focusTrigger, USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface UserBalancesDialogProps {
  /** null = chiuso */
  userId: number | null
  userName: string
  /** Sede della persona: permette all'admin di modificare i valori annui (senza, sono in sola lettura) */
  locationId?: number
  /** Nome della sede, mostrato accanto alle ore settimanali */
  locationName?: string
  onClose: () => void
}

interface BodyProps {
  userId: number
  userName: string
  locationId?: number
  locationName?: string
}

const BalancesBody = ({ userId, userName, locationId, locationName }: BodyProps) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [balanceFilter, setBalanceFilter] = useState<BalanceType | 'all'>('all')
  const [aligning, setAligning] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const summary = useUserBalances(userId, year)
  const movements = useUserBalanceMovements(userId, balanceFilter === 'all' ? { year } : { year, balance: balanceFilter })
  const items = movements.data?.pages.flatMap((page) => page.data) ?? []

  // Un refresh in background fallito non smonta la scheda (e con lei Allinea e Rettifica aperti): l'errore vale solo senza dati
  if (summary.data === undefined && summary.isPending) {
    return (
      <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (summary.data === undefined) {
    // 404: la persona non è più visibile (es. spostata in un'altra sede), riprovare non serve
    if (isApiError(summary.error) && summary.error.status === 404) return <p role="alert">{t('balances.dialog.notVisible')}</p>
    return (
      <div role="alert" className="grid justify-items-start gap-2">
        <p>{t('balances.dialog.loadError')}</p>
        <Button variant="outline" onClick={() => void summary.refetch()}>
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  const data = summary.data
  if (!data.applicable) return <p className="text-muted-foreground">{t('balances.dialog.notApplicable')}</p>

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5 text-sm text-muted-foreground">
          <span>
            {t('balances.dialog.weekly', { hours: formatHours(data.weekly_minutes, locale) })}
            {locationName !== undefined && ` · ${locationName}`}
          </span>
          {data.last_aligned_on !== null && <span>{t('balances.dialog.lastAligned', { date: formatNumericDate(data.last_aligned_on, locale) })}</span>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <BalanceYearSelect year={year} onChange={setYear} />
          {data.can.adjust && (
            <>
              <Button variant="outline" onClick={() => setAligning(true)}>
                {t('balances.dialog.align')}
              </Button>
              <Button variant="outline" onClick={() => setAdjusting(true)}>
                {t('balances.dialog.adjust')}
              </Button>
            </>
          )}
        </div>
      </div>

      <BalanceCards summary={data} />

      <BalanceMovementsSection balances={data.balances} filter={balanceFilter} onFilterChange={setBalanceFilter} query={movements} items={items} showActor />

      <UserAccrualSection userId={userId} locationId={locationId} summary={data} />

      <AlignBalancesDialog userId={userId} userName={userName} open={aligning} onClose={() => setAligning(false)} />
      <AdjustBalanceDialog userId={userId} userName={userName} summary={data} open={adjusting} onClose={() => setAdjusting(false)} />
    </div>
  )
}

/** Scheda saldi di una persona: riquadri, movimenti, valori annui, Allinea e Rettifica (spec SP2 fase 2 §7.3). */
const UserBalancesDialog = ({ userId, userName, locationId, locationName, onClose }: UserBalancesDialogProps) => {
  const { t } = useTranslation()
  // Nome e id conservati durante l'animazione di chiusura
  const [last, setLast] = useState<{ id: number; name: string; locationId?: number } | null>(null)
  if (userId !== null && (last === null || last.id !== userId || last.name !== userName || last.locationId !== locationId)) setLast({ id: userId, name: userName, locationId })
  const shown = userId === null ? last : { id: userId, name: userName, locationId }

  return (
    <Dialog open={userId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-4xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(USER_TRIGGER_ATTRIBUTE, shown?.id ?? null)
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('balances.dialog.title', { name: shown?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('balances.dialog.description')}</DialogDescription>
        </DialogHeader>
        {userId !== null && <BalancesBody key={userId} userId={userId} userName={userName} locationId={locationId} locationName={locationName} />}
      </DialogContent>
    </Dialog>
  )
}

export default UserBalancesDialog
