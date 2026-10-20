import { ClipboardCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Card, CardContent } from '@/components/ui/card'
import { useCurrentUser } from '@/features/auth/api'

/** Riquadro "N richieste da approvare" per responsabili e admin: non compare con 0 o `null` (chi non approva). */
const PendingApprovalsCard = () => {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const count = user?.pendingApprovals ?? 0
  if (count <= 0) return null

  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <ClipboardCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="grid gap-0.5">
          <Link to="/leave?tab=approvals" className="font-medium text-primary underline-offset-4 hover:underline">
            {t('home.approvals.title', { count })}
          </Link>
          <p className="text-sm text-muted-foreground">{t('home.approvals.hint')}</p>
        </div>
      </CardContent>
    </Card>
  )
}

export default PendingApprovalsCard
