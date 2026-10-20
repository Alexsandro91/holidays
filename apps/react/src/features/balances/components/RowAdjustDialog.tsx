import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useUserBalances } from '@/features/balances/api'
import AdjustBalanceDialog from '@/features/balances/components/AdjustBalanceDialog'
import { focusTrigger, USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface Target {
  id: number
  name: string
}

interface RowAdjustDialogProps {
  /** null = chiuso */
  target: Target | null
  onClose: () => void
}

interface BodyProps extends Target {
  open: boolean
  onClose: () => void
}

const Body = ({ id, name, open, onClose }: BodyProps) => {
  const { t } = useTranslation()
  const summary = useUserBalances(id, new Date().getFullYear())

  if (summary.data !== undefined && summary.data.applicable) {
    return <AdjustBalanceDialog userId={id} userName={name} summary={summary.data} open={open} onClose={onClose} returnFocusToUser={id} />
  }

  // I saldi servono alla scelta del saldo e all'anteprima: finché non arrivano il dialog mostra attesa, errore o il motivo
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(USER_TRIGGER_ATTRIBUTE, id)
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('balances.adjust.title', { name })}</DialogTitle>
          <DialogDescription>{t('balances.adjust.description')}</DialogDescription>
        </DialogHeader>
        {summary.data !== undefined ? (
          <p className="text-muted-foreground">{t('balances.dialog.notApplicable')}</p>
        ) : summary.isError ? (
          <div role="alert" className="grid justify-items-start gap-2">
            <p>{t('balances.dialog.loadError')}</p>
            <Button variant="outline" onClick={() => void summary.refetch()}>
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <div role="status" aria-busy="true" aria-label={t('common.loading')}>
            <Skeleton className="h-24 w-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Rettifica aperta dal menu di riga della pagina Saldi: legge i saldi della persona e poi mostra il dialog. */
const RowAdjustDialog = ({ target, onClose }: RowAdjustDialogProps) => {
  // Persona conservata durante l'animazione di chiusura
  const [last, setLast] = useState<Target | null>(null)
  if (target !== null && (last === null || last.id !== target.id || last.name !== target.name)) setLast(target)
  return last === null ? null : <Body key={last.id} id={last.id} name={last.name} open={target !== null} onClose={onClose} />
}

export default RowAdjustDialog
