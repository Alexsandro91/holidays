import { GripVertical } from 'lucide-react'
import { useState, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { AbsenceType } from '@/features/absenceTypes/api'
import { balanceLabel, employmentLabel, limitLabel, requestUnits } from '@/features/absenceTypes/describe'
import { cn } from '@/lib/utils'

interface AbsenceTypesTableProps {
  absenceTypes: AbsenceType[]
  /** true nella scheda Attivi: le righe si trascinano */
  reorderable: boolean
  /** Sposta il tipo `id` nella posizione `toIndex` */
  onMove: (id: number, toIndex: number) => void
  renderActions: (absenceType: AbsenceType, index: number) => ReactNode
}

/** Nome con il badge "Predefinito" e, per i tipi con abilitazione, quante persone la hanno. */
const NameCell = ({ absenceType }: { absenceType: AbsenceType }) => {
  const { t } = useTranslation()
  return (
    <span className="grid gap-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{absenceType.name}</span>
        {absenceType.code !== null && (
          <Badge variant="secondary" className="bg-primary-soft text-primary-soft-foreground">
            {t('absenceTypes.badges.default')}
          </Badge>
        )}
      </span>
      {absenceType.requires_enablement && typeof absenceType.enabled_users_count === 'number' && (
        <span className="text-sm text-muted-foreground">{t('absenceTypes.enabledUsers', { count: absenceType.enabled_users_count })}</span>
      )}
    </span>
  )
}

/**
 * Tabella su desktop, schede su mobile (le due viste sono nel DOM e si alternano via CSS, come Sedi).
 * Il trascinamento usa gli eventi HTML5 nativi sulle righe della tabella; da tastiera e da touch ci sono le voci del menu.
 */
const AbsenceTypesTable = ({ absenceTypes, reorderable, onMove, renderActions }: AbsenceTypesTableProps) => {
  const { t } = useTranslation()
  const [draggedId, setDraggedId] = useState<number | null>(null)

  const start = (event: DragEvent<HTMLTableRowElement>, id: number) => {
    event.dataTransfer.effectAllowed = 'move'
    // Firefox non avvia il trascinamento senza dati
    event.dataTransfer.setData('text/plain', String(id))
    setDraggedId(id)
  }
  const over = (event: DragEvent<HTMLTableRowElement>) => {
    if (draggedId === null) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }
  const drop = (event: DragEvent<HTMLTableRowElement>, toIndex: number) => {
    event.preventDefault()
    if (draggedId !== null) onMove(draggedId, toIndex)
    setDraggedId(null)
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableCaption className="sr-only">{t('absenceTypes.title')}</TableCaption>
          <TableHeader>
            <TableRow>
              {reorderable && (
                <TableHead className="w-8">
                  <span className="sr-only">{t('absenceTypes.dragHandle')}</span>
                </TableHead>
              )}
              <TableHead>{t('absenceTypes.columns.name')}</TableHead>
              <TableHead>{t('absenceTypes.columns.request')}</TableHead>
              <TableHead>{t('absenceTypes.columns.balance')}</TableHead>
              <TableHead>{t('absenceTypes.columns.approval')}</TableHead>
              <TableHead>{t('absenceTypes.columns.employment')}</TableHead>
              <TableHead>{t('absenceTypes.columns.limit')}</TableHead>
              <TableHead>
                <span className="sr-only">{t('absenceTypes.columns.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {absenceTypes.map((absenceType, index) => (
              <TableRow
                key={absenceType.id}
                draggable={reorderable || undefined}
                onDragStart={reorderable ? (event) => start(event, absenceType.id) : undefined}
                onDragOver={reorderable ? over : undefined}
                onDrop={reorderable ? (event) => drop(event, index) : undefined}
                onDragEnd={reorderable ? () => setDraggedId(null) : undefined}
                className={cn(draggedId === absenceType.id && 'opacity-50')}
              >
                {reorderable && (
                  <TableCell className="w-8 pr-0 text-muted-foreground">
                    <span aria-hidden="true" className="flex cursor-grab">
                      <GripVertical className="size-4" />
                    </span>
                  </TableCell>
                )}
                <TableCell>
                  <NameCell absenceType={absenceType} />
                </TableCell>
                <TableCell>{requestUnits(absenceType, t)}</TableCell>
                <TableCell className={cn(absenceType.balance === null && 'text-muted-foreground')}>{balanceLabel(absenceType, t)}</TableCell>
                <TableCell>{absenceType.requires_approval ? t('absenceTypes.approval.required') : t('absenceTypes.approval.notRequired')}</TableCell>
                <TableCell>{employmentLabel(absenceType, t)}</TableCell>
                <TableCell className={cn(absenceType.limit === null && 'text-muted-foreground')}>{limitLabel(absenceType, t)}</TableCell>
                <TableCell className="text-right">{renderActions(absenceType, index)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="grid gap-3 md:hidden">
        {absenceTypes.map((absenceType, index) => (
          <li key={absenceType.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg border p-4">
            <div className="grid gap-2">
              <NameCell absenceType={absenceType} />
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">{t('absenceTypes.columns.request')}</dt>
                <dd>{requestUnits(absenceType, t)}</dd>
                <dt className="text-muted-foreground">{t('absenceTypes.columns.balance')}</dt>
                <dd>{balanceLabel(absenceType, t)}</dd>
                <dt className="text-muted-foreground">{t('absenceTypes.columns.approval')}</dt>
                <dd>{absenceType.requires_approval ? t('absenceTypes.approval.required') : t('absenceTypes.approval.notRequired')}</dd>
                <dt className="text-muted-foreground">{t('absenceTypes.columns.employment')}</dt>
                <dd>{employmentLabel(absenceType, t)}</dd>
                <dt className="text-muted-foreground">{t('absenceTypes.columns.limit')}</dt>
                <dd>{limitLabel(absenceType, t)}</dd>
              </dl>
            </div>
            <div className="-mt-2 -mr-2">{renderActions(absenceType, index)}</div>
          </li>
        ))}
      </ul>
    </>
  )
}

export default AbsenceTypesTable
