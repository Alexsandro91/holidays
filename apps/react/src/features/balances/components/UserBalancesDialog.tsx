import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { balanceTypeSchema, useUserBalanceMovements, useUserBalances, type BalanceType } from '@/features/balances/api'
import { formatNumericDate } from '@/features/balances/describeMovement'
import AdjustBalanceDialog from '@/features/balances/components/AdjustBalanceDialog'
import AlignBalancesDialog from '@/features/balances/components/AlignBalancesDialog'
import BalanceCards from '@/features/balances/components/BalanceCards'
import BalanceMovementsList from '@/features/balances/components/BalanceMovementsList'
import UserAccrualSection from '@/features/balances/components/UserAccrualSection'
import { formatHours } from '@/features/balances/hoursFormat'
import LoadMore from '@/features/history/components/LoadMore'
import { isApiError } from '@/lib/api'
import { focusTrigger, USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface UserBalancesDialogProps {
  /** null = chiuso */
  userId: number | null
  userName: string
  /** Sede della persona: permette all'admin di modificare i valori annui (senza, sono in sola lettura) */
  locationId?: number
  onClose: () => void
}

const YEARS_SHOWN = 5

interface BodyProps {
  userId: number
  userName: string
  locationId?: number
}

const BalancesBody = ({ userId, userName, locationId }: BodyProps) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: YEARS_SHOWN }, (_, index) => currentYear - index)
  const [year, setYear] = useState(currentYear)
  const [balanceFilter, setBalanceFilter] = useState<BalanceType | 'all'>('all')
  const [aligning, setAligning] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const summary = useUserBalances(userId, year)
  const movements = useUserBalanceMovements(userId, balanceFilter === 'all' ? { year } : { year, balance: balanceFilter })
  const items = movements.data?.pages.flatMap((page) => page.data) ?? []

  if (summary.isPending) {
    return (
      <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-16 w-full" />
        ))}
      </div>
    )
  }

  if (summary.isError) {
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

  const movementsBody = () => {
    if (movements.isPending) return <Skeleton className="h-10 w-full" />
    if (movements.isError && items.length === 0) {
      return (
        <div role="alert" className="grid justify-items-start gap-2">
          <p>{t('balances.dialog.movementsLoadError')}</p>
          <Button variant="outline" onClick={() => void movements.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      )
    }
    if (items.length === 0) return <p className="text-muted-foreground">{t('balances.dialog.noMovements')}</p>
    return <BalanceMovementsList movements={items} showActor />
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5 text-sm text-muted-foreground">
          <span>{t('balances.dialog.weekly', { hours: formatHours(data.weekly_minutes, locale) })}</span>
          {data.last_aligned_on !== null && <span>{t('balances.dialog.lastAligned', { date: formatNumericDate(data.last_aligned_on, locale) })}</span>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1">
            <Label htmlFor="balances-year">{t('balances.dialog.year')}</Label>
            <Select value={String(year)} onValueChange={(next) => setYear(years.find((item) => String(item) === next) ?? currentYear)}>
              <SelectTrigger id="balances-year" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {years.map((item) => (
                  <SelectItem key={item} value={String(item)}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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

      <section aria-labelledby="balances-movements-title" className="grid gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 id="balances-movements-title" className="font-heading text-base font-semibold">
            {t('balances.dialog.movements')}
          </h3>
          <div className="grid gap-1">
            <Label htmlFor="balances-filter">{t('balances.dialog.balanceFilter')}</Label>
            <Select
              value={balanceFilter}
              onValueChange={(next) => {
                const parsed = balanceTypeSchema.safeParse(next)
                setBalanceFilter(parsed.success ? parsed.data : 'all')
              }}
            >
              <SelectTrigger id="balances-filter" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="all">{t('balances.dialog.allBalances')}</SelectItem>
                {data.balances.map((item) => (
                  <SelectItem key={item.balance} value={item.balance}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {movementsBody()}
        {movements.hasNextPage && (
          <LoadMore
            pending={movements.isFetchingNextPage}
            failed={movements.isFetchNextPageError}
            onLoad={() => void movements.fetchNextPage()}
            labels={{ loadMore: t('balances.dialog.loadMore'), error: t('balances.dialog.loadMoreError') }}
          />
        )}
      </section>

      <UserAccrualSection userId={userId} locationId={locationId} summary={data} />

      <AlignBalancesDialog userId={userId} userName={userName} open={aligning} onClose={() => setAligning(false)} />
      <AdjustBalanceDialog userId={userId} userName={userName} summary={data} open={adjusting} onClose={() => setAdjusting(false)} />
    </div>
  )
}

/** Scheda saldi di una persona: riquadri, movimenti, valori annui, Allinea e Rettifica (spec SP2 fase 2 §7.3). */
const UserBalancesDialog = ({ userId, userName, locationId, onClose }: UserBalancesDialogProps) => {
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
        {userId !== null && <BalancesBody key={userId} userId={userId} userName={userName} locationId={locationId} />}
      </DialogContent>
    </Dialog>
  )
}

export default UserBalancesDialog
