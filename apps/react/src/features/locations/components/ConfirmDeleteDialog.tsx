import { LoaderCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
import { focusTrigger, LOCATION_DETAIL_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface ConfirmDeleteDialogProps {
  open: boolean
  title: string
  description: string
  actionLabel: string
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
  /** Valore di LOCATION_DETAIL_TRIGGER_ATTRIBUTE del pulsante che l'ha aperto: alla chiusura il focus torna lì */
  triggerKey: string | null
}

/** Conferma di un'eliminazione nel dettaglio della sede (versione futura dell'orario, chiusura). */
const ConfirmDeleteDialog = ({ open, title, description, actionLabel, pending, onConfirm, onCancel, triggerKey }: ConfirmDeleteDialogProps) => {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(LOCATION_DETAIL_TRIGGER_ATTRIBUTE, triggerKey)
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('locations.confirm.back')}</AlertDialogCancel>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {actionLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default ConfirmDeleteDialog
