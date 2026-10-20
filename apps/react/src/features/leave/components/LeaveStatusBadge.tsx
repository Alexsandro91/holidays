import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import type { LeaveRequestStatus } from '@/features/leave/api'
import { LEAVE_STATUS_CLASSES } from '@/features/leave/statusStyles'
import { cn } from '@/lib/utils'

interface LeaveStatusBadgeProps {
  status: LeaveRequestStatus
  className?: string
}

/** Stato di una richiesta sempre in testo: il colore non è l'unico segnale. */
const LeaveStatusBadge = ({ status, className }: LeaveStatusBadgeProps) => {
  const { t } = useTranslation()
  return (
    <Badge variant="secondary" data-status={status} className={cn(LEAVE_STATUS_CLASSES[status], className)}>
      {t(`leave.status.${status}`)}
    </Badge>
  )
}

export default LeaveStatusBadge
