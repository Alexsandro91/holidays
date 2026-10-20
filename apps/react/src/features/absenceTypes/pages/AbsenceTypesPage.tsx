import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import PageHeading from '@/components/layout/PageHeading'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAbsenceTypes, useReorderAbsenceTypes, useUpdateAbsenceType, type AbsenceType, type AbsenceTypeStatus } from '@/features/absenceTypes/api'
import AbsenceTypeActionsMenu, { type AbsenceTypeAction } from '@/features/absenceTypes/components/AbsenceTypeActionsMenu'
import AbsenceTypeConfirmDialog, { type AbsenceTypeConfirmAction } from '@/features/absenceTypes/components/AbsenceTypeConfirmDialog'
import AbsenceTypeFormDialog from '@/features/absenceTypes/components/AbsenceTypeFormDialog'
import AbsenceTypesTable from '@/features/absenceTypes/components/AbsenceTypesTable'
import { isApiError } from '@/lib/api'

const STATUSES: AbsenceTypeStatus[] = ['active', 'archived']

const isStatus = (value: string): value is AbsenceTypeStatus => STATUSES.some((status) => status === value)

/** Sezione Tipi di assenza (solo admin, spec SP2 fase 2 §7.7): schede Attivi e Archiviati, riordino dei tipi attivi. */
const AbsenceTypesPage = () => {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const statusParam = searchParams.get('status') ?? ''
  const status: AbsenceTypeStatus = isStatus(statusParam) ? statusParam : 'active'
  const types = useAbsenceTypes(status)
  const reorder = useReorderAbsenceTypes()
  const update = useUpdateAbsenceType()
  const [editing, setEditing] = useState<{ absenceType: AbsenceType | null } | null>(null)
  const [confirm, setConfirm] = useState<{ absenceType: AbsenceType; action: AbsenceTypeConfirmAction } | null>(null)
  // Ordine mostrato subito dopo un riordino, finché il server non risponde (e la lista si ricarica)
  const [pendingIds, setPendingIds] = useState<number[] | null>(null)

  const changeStatus = (next: AbsenceTypeStatus) =>
    setSearchParams((current) => {
      const query = new URLSearchParams(current)
      if (next === 'active') query.delete('status')
      else query.set('status', next)
      return query
    })

  const loaded = types.data?.data ?? []
  const rows = pendingIds === null ? loaded : pendingIds.flatMap((id) => loaded.filter((item) => item.id === id))

  const showError = (error: unknown) => toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))

  /** Riordino ottimistico: la lista cambia subito e torna com'era se il server risponde con un errore. */
  const applyOrder = async (ids: number[]) => {
    if (reorder.isPending) return
    setPendingIds(ids)
    try {
      await reorder.mutateAsync(ids)
    } catch (error) {
      showError(error)
    } finally {
      setPendingIds(null)
    }
  }

  const move = (id: number, toIndex: number) => {
    const from = rows.findIndex((item) => item.id === id)
    if (from < 0 || from === toIndex) return
    const ids = rows.map((item) => item.id)
    ids.splice(toIndex, 0, ...ids.splice(from, 1))
    void applyOrder(ids)
  }

  const resetName = async (absenceType: AbsenceType) => {
    try {
      await update.mutateAsync({ id: absenceType.id, name: null })
      toast.success(t('absenceTypes.resetNameDone'))
    } catch (error) {
      showError(error)
    }
  }

  const select = (absenceType: AbsenceType, index: number, action: AbsenceTypeAction) => {
    switch (action) {
      case 'edit':
        return setEditing({ absenceType })
      case 'moveUp':
        return move(absenceType.id, index - 1)
      case 'moveDown':
        return move(absenceType.id, index + 1)
      case 'resetName':
        return void resetName(absenceType)
      case 'archive':
      case 'restore':
        return setConfirm({ absenceType, action })
    }
  }

  return (
    <>
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <PageHeading title={t('absenceTypes.title')} description={t('absenceTypes.subtitle')} className="mb-0" />
        <Button onClick={() => setEditing({ absenceType: null })}>
          <Plus aria-hidden="true" />
          {t('absenceTypes.add')}
        </Button>
      </div>
      <Tabs value={status} onValueChange={(next) => isStatus(next) && changeStatus(next)}>
        <TabsList aria-label={t('absenceTypes.tabs.label')}>
          {STATUSES.map((item) => (
            <TabsTrigger key={item} value={item} className="h-7 flex-none gap-1.5 text-muted-foreground">
              {t(`absenceTypes.tabs.${item}`)}
              {types.data !== undefined && (
                <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{types.data.meta.counts[item]}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={status}>
          {types.isPending ? (
            <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
              {[0, 1, 2].map((row) => (
                <Skeleton key={row} className="h-14 w-full" />
              ))}
            </div>
          ) : types.isError ? (
            <div role="alert" className="grid justify-items-start gap-3 rounded-lg border p-6">
              <p>{t('absenceTypes.loadError')}</p>
              <Button variant="outline" onClick={() => void types.refetch()}>
                {t('common.retry')}
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="rounded-lg border p-6">{t(`absenceTypes.empty.${status}`)}</p>
          ) : (
            <AbsenceTypesTable
              absenceTypes={rows}
              reorderable={status === 'active'}
              onMove={move}
              renderActions={(absenceType, index) => (
                <AbsenceTypeActionsMenu
                  absenceType={absenceType}
                  reorderable={status === 'active'}
                  isFirst={index === 0}
                  isLast={index === rows.length - 1}
                  onSelect={(action) => select(absenceType, index, action)}
                />
              )}
            />
          )}
        </TabsContent>
      </Tabs>
      <AbsenceTypeFormDialog open={editing !== null} absenceType={editing?.absenceType ?? null} onClose={() => setEditing(null)} />
      <AbsenceTypeConfirmDialog absenceType={confirm?.absenceType ?? null} action={confirm?.action ?? null} onClose={() => setConfirm(null)} />
    </>
  )
}

export default AbsenceTypesPage
