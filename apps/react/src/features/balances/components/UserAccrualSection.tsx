import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { useLocationAccrual, useUpdateUserAccrual, useUserAccrual, type BalanceSummary } from '@/features/balances/api'
import AccrualValuesForm, { type AccrualSchedule, type AccrualValues } from '@/features/balances/components/AccrualValuesForm'
import { formatHours } from '@/features/balances/hoursFormat'
import { isApiError } from '@/lib/api'

interface UserAccrualSectionProps {
  userId: number
  /** Sede della persona: serve all'admin per sapere cosa erediterebbe; senza, la sezione è in sola lettura */
  locationId?: number
  summary: BalanceSummary
}

interface EditorProps {
  userId: number
  locationId: number
  schedule: AccrualSchedule
}

/** Modifica dei valori annui della persona (solo admin): eredita dalla sede oppure un valore proprio. */
const AccrualEditor = ({ userId, locationId, schedule }: EditorProps) => {
  const { t } = useTranslation()
  const own = useUserAccrual(userId)
  const location = useLocationAccrual(locationId)
  const update = useUpdateUserAccrual(userId)

  if (own.isPending || location.isPending) {
    return (
      <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
      </div>
    )
  }
  if (own.isError || location.isError) return <p role="alert">{t('balances.accrual.loadError')}</p>

  const save = async (values: AccrualValues) => {
    try {
      await update.mutateAsync(values)
      toast.success(t('accrual.saved'))
    } catch (error) {
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
    }
  }

  return (
    // Rimontato dopo il salvataggio: i campi ripartono dai valori del server
    <AccrualValuesForm
      key={JSON.stringify(own.data.values)}
      values={own.data.values}
      effective={location.data.effective}
      inheritable
      inheritFrom="location"
      schedule={schedule}
      onSubmit={(values) => void save(values)}
      pending={update.isPending}
    />
  )
}

/** Valori annui della persona: l'admin li modifica, il responsabile li legge con la loro provenienza (spec SP2 fase 2 §7.3). */
const UserAccrualSection = ({ userId, locationId, summary }: UserAccrualSectionProps) => {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const editable = summary.can.manage_accrual && locationId !== undefined

  return (
    <section aria-labelledby="user-accrual-title" className="grid gap-3">
      <div>
        <h3 id="user-accrual-title" className="font-heading text-base font-semibold">
          {t('balances.accrual.title')}
        </h3>
        <p className="text-sm text-muted-foreground">{t('balances.accrual.description')}</p>
      </div>
      {editable ? (
        <AccrualEditor
          userId={userId}
          locationId={locationId}
          schedule={{ weeklyMinutes: summary.weekly_minutes, locationWeeklyMinutes: summary.location_weekly_minutes }}
        />
      ) : (
        <ul className="grid gap-2">
          {summary.balances.map(({ balance, label, annual, monthly_quota_minutes: monthly }) => (
            <li key={balance} className="grid gap-0.5">
              <span className="font-medium">{label}</span>
              <span>{t(`balances.accrual.${annual.source}`, { hours: formatHours(annual.minutes, locale) })}</span>
              {/* Chi oggi non matura ha quota 0: non è un errore, la quota non si mostra */}
              {monthly > 0 && <span className="text-sm text-muted-foreground">{t('balances.accrual.monthly', { hours: formatHours(monthly, locale) })}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default UserAccrualSection
