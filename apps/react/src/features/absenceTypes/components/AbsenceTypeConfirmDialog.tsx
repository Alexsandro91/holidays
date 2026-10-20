import { LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useArchiveAbsenceType, useRestoreAbsenceType, type AbsenceType } from '@/features/absenceTypes/api'
import { isApiError } from '@/lib/api'
import { ABSENCE_TYPE_TRIGGER_ATTRIBUTE, focusTrigger } from '@/lib/focusTrigger'

export type AbsenceTypeConfirmAction = 'archive' | 'restore'

interface AbsenceTypeConfirmDialogProps {
  absenceType: AbsenceType | null
  action: AbsenceTypeConfirmAction | null
  onClose: () => void
}

interface ConfirmBodyProps {
  absenceType: AbsenceType
  action: AbsenceTypeConfirmAction
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

const ConfirmBody = ({ absenceType, action, onClose, onBusyChange }: ConfirmBodyProps) => {
  const { t } = useTranslation()
  const archive = useArchiveAbsenceType()
  const restore = useRestoreAbsenceType()
  const [pending, setPending] = useState(false)
  // Evita il doppio invio: letto solo nei gestori di evento
  const submitting = useRef(false)
  const texts = { name: absenceType.name }

  const confirm = async () => {
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    onBusyChange(true)
    try {
      if (action === 'archive') await archive.mutateAsync(absenceType.id)
      else await restore.mutateAsync(absenceType.id)
    } catch (error) {
      submitting.current = false
      setPending(false)
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
      onClose()
      return
    } finally {
      onBusyChange(false)
    }
    toast.success(t(`absenceTypes.confirm.${action}.done`, texts))
    onClose()
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{t(`absenceTypes.confirm.${action}.title`, texts)}</AlertDialogTitle>
        <AlertDialogDescription>{t(`absenceTypes.confirm.${action}.description`, texts)}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>{t('absenceTypes.confirm.back')}</AlertDialogCancel>
        <Button variant={action === 'archive' ? 'destructive' : 'default'} disabled={pending} onClick={() => void confirm()}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t(`absenceTypes.confirm.${action}.action`, texts)}
        </Button>
      </AlertDialogFooter>
    </>
  )
}

/** Conferma di Archivia e Ripristina di un tipo di assenza. */
const AbsenceTypeConfirmDialog = ({ absenceType, action, onClose }: AbsenceTypeConfirmDialogProps) => {
  const open = absenceType !== null && action !== null
  // Contenuto conservato durante l'animazione di chiusura
  const [last, setLast] = useState<{ absenceType: AbsenceType; action: AbsenceTypeConfirmAction } | null>(null)
  if (absenceType !== null && action !== null && (last?.absenceType !== absenceType || last.action !== action)) setLast({ absenceType, action })
  const shown = open ? { absenceType, action } : last
  // Conta le aperture: ogni apertura rimonta il corpo
  const [openCount, setOpenCount] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount(openCount + 1)
  }
  // Durante l'invio il dialog non si chiude (Escape, clic fuori)
  const [busy, setBusy] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(ABSENCE_TYPE_TRIGGER_ATTRIBUTE, shown?.absenceType.id ?? null)
        }}
      >
        {shown && <ConfirmBody key={`${openCount}-${shown.absenceType.id}-${shown.action}`} absenceType={shown.absenceType} action={shown.action} onClose={onClose} onBusyChange={setBusy} />}
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default AbsenceTypeConfirmDialog
