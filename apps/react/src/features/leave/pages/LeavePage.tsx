import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCurrentUser } from '@/features/auth/api'
import type { LeaveDayRange } from '@/features/leave/calendarDates'
import LeaveMonthCalendar from '@/features/leave/components/LeaveMonthCalendar'
import LeaveRequestDetailDialog from '@/features/leave/components/LeaveRequestDetailDialog'
import LeaveRequestDialog from '@/features/leave/components/LeaveRequestDialog'
import MyLeaveRequestsList from '@/features/leave/components/MyLeaveRequestsList'
import { LEAVE_TRIGGER_ATTRIBUTE, NEW_LEAVE_TRIGGER } from '@/lib/focusTrigger'

type LeaveTab = 'calendar' | 'approvals'

const TABS: readonly LeaveTab[] = ['calendar', 'approvals']

const isTab = (value: string): value is LeaveTab => TABS.some((tab) => tab === value)

/** Dialog aperto e chi lo ha aperto; i dati restano durante l'animazione di chiusura. */
interface RequestDialogState {
  open: boolean
  range: LeaveDayRange | null
  trigger: string | null
}

interface DetailDialogState {
  open: boolean
  requestId: number | null
  trigger: string | null
}

/**
 * Ferie e permessi (spec §7.2). Schede nell'URL (`?tab=calendar|approvals`, senza parametro il calendario): "Da
 * approvare" c'è solo per chi approva (`pending_approvals` non null), anche con 0 richieste.
 */
const LeavePage = () => {
  const { t } = useTranslation()
  const { data: user } = useCurrentUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const pendingApprovals = user?.pendingApprovals ?? null
  const canApprove = pendingApprovals !== null
  const tabParam = searchParams.get('tab') ?? ''
  const tab: LeaveTab = canApprove && isTab(tabParam) ? tabParam : 'calendar'
  const [requestDialog, setRequestDialog] = useState<RequestDialogState>({ open: false, range: null, trigger: null })
  const [detailDialog, setDetailDialog] = useState<DetailDialogState>({ open: false, requestId: null, trigger: null })

  const changeTab = (next: LeaveTab) =>
    setSearchParams((current) => {
      const query = new URLSearchParams(current)
      if (next === 'calendar') query.delete('tab')
      else query.set('tab', next)
      return query
    })

  const openRequest = (range: LeaveDayRange | null, trigger: string) => setRequestDialog({ open: true, range, trigger })
  const openDetail = (requestId: number, trigger: string) => setDetailDialog({ open: true, requestId, trigger })

  const calendarPanel = (
    <div className="grid gap-10">
      <LeaveMonthCalendar onSelectRange={openRequest} onOpenRequest={openDetail} />
      <MyLeaveRequestsList onOpen={openDetail} />
    </div>
  )

  return (
    <>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <PageHeading title={t('leave.title')} description={t('leave.description')} className="mb-0" />
        <Button onClick={() => openRequest(null, NEW_LEAVE_TRIGGER)} {...{ [LEAVE_TRIGGER_ATTRIBUTE]: NEW_LEAVE_TRIGGER }}>
          <Plus aria-hidden="true" />
          {t('leave.new')}
        </Button>
      </div>
      {canApprove ? (
        <Tabs value={tab} onValueChange={(next) => isTab(next) && changeTab(next)}>
          <TabsList aria-label={t('leave.tabs.label')}>
            <TabsTrigger value="calendar" className="h-7 flex-none text-muted-foreground">
              {t('leave.tabs.calendar')}
            </TabsTrigger>
            <TabsTrigger value="approvals" className="h-7 flex-none gap-1.5 text-muted-foreground">
              {t('leave.tabs.approvals')}
              {/* Lo spazio separa il numero nel nome accessibile ("Da approvare 3"); nel flex non si vede */}{' '}
              {pendingApprovals > 0 && <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{pendingApprovals}</span>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="calendar" className="pt-4">
            {calendarPanel}
          </TabsContent>
          {/* Da approvare: la riempie il Task 11 */}
          <TabsContent value="approvals" className="pt-4" />
        </Tabs>
      ) : (
        calendarPanel
      )}
      <LeaveRequestDialog
        open={requestDialog.open}
        range={requestDialog.range}
        returnFocusTo={requestDialog.trigger}
        onClose={() => setRequestDialog((current) => ({ ...current, open: false }))}
      />
      <LeaveRequestDetailDialog
        open={detailDialog.open}
        requestId={detailDialog.requestId}
        returnFocusTo={detailDialog.trigger}
        onClose={() => setDetailDialog((current) => ({ ...current, open: false }))}
      />
    </>
  )
}

export default LeavePage
