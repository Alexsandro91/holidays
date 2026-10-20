import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import type { LeaveRequestStatus } from '@/features/leave/api'
import { cn } from '@/lib/utils'

interface LeaveStatusBadgeProps {
  status: LeaveRequestStatus
}

// Colore di significato (token in index.css, contrasto AA nei due temi): in attesa giallo, approvata verde, non approvata rosso,
// annullamento richiesto grigio azzurro; ritirata e annullata come "Disattivato"
const STATUS_CLASSES: Record<LeaveRequestStatus, string> = {
  pending: 'bg-leave-pending text-leave-pending-foreground',
  approved: 'bg-leave-approved text-leave-approved-foreground',
  rejected: 'bg-leave-rejected text-leave-rejected-foreground',
  cancellation_requested: 'bg-leave-cancellation text-leave-cancellation-foreground',
  withdrawn: 'bg-status-disabled text-status-disabled-foreground',
  cancelled: 'bg-status-disabled text-status-disabled-foreground',
}

/** Stato di una richiesta sempre in testo: il colore non è l'unico segnale. */
const LeaveStatusBadge = ({ status }: LeaveStatusBadgeProps) => {
  const { t } = useTranslation()
  return (
    <Badge variant="secondary" data-status={status} className={cn(STATUS_CLASSES[status])}>
      {t(`leave.status.${status}`)}
    </Badge>
  )
}

export default LeaveStatusBadge
