import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { LeaveRequest } from '@/features/leave/api'
import RejectNoteField from '@/features/leave/components/RejectNoteField'
import { describePeriod } from '@/features/leave/describeRequest'
import { focusTrigger, LEAVE_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface RejectDialogProps {
  open: boolean
  /** Richiesta da rifiutare; resta impostata durante l'animazione di chiusura */
  request: LeaveRequest | null
  /** Invio in corso: il dialog non si chiude e il pulsante è fermo */
  pending: boolean
  /** Valore di LEAVE_TRIGGER_ATTRIBUTE dell'elemento che riprende il focus alla chiusura (null = titolo della pagina) */
  returnFocusTo: string | null
  /** Riceve il motivo scritto (anche vuoto: il motivo è facoltativo) */
  onConfirm: (note: string) => void
  onClose: () => void
}

interface RejectBodyProps {
  request: LeaveRequest
  pending: boolean
  onConfirm: (note: string) => void
  onClose: () => void
}

/** Il motivo è stato locale del contenuto: Radix lo smonta alla chiusura e a ogni apertura riparte vuoto. */
const RejectBody = ({ request, pending, onConfirm, onClose }: RejectBodyProps) => {
  const { t, i18n } = useTranslation()
  const [note, setNote] = useState('')
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('leave.reject.title')}</DialogTitle>
        <DialogDescription>{t('leave.reject.description', { name: request.user.name, period: describePeriod(request, t, i18n.language) })}</DialogDescription>
      </DialogHeader>
      <RejectNoteField value={note} onChange={setNote} disabled={pending} />
      <DialogFooter>
        <Button variant="outline" disabled={pending} onClick={onClose}>
          {t('leave.reject.cancel')}
        </Button>
        <Button variant="destructive" disabled={pending} onClick={() => onConfirm(note)}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('leave.reject.confirm')}
        </Button>
      </DialogFooter>
    </>
  )
}

/** Rifiuto di una richiesta dall'elenco Da approvare (spec §7.2): motivo facoltativo, al massimo 500 caratteri. */
const RejectDialog = ({ open, request, pending, returnFocusTo, onConfirm, onClose }: RejectDialogProps) => (
  <Dialog open={open && request !== null} onOpenChange={(next) => !next && !pending && onClose()}>
    <DialogContent
      onCloseAutoFocus={(event) => {
        event.preventDefault()
        focusTrigger(LEAVE_TRIGGER_ATTRIBUTE, returnFocusTo)
      }}
    >
      {request !== null && <RejectBody request={request} pending={pending} onConfirm={onConfirm} onClose={onClose} />}
    </DialogContent>
  </Dialog>
)

export default RejectDialog
