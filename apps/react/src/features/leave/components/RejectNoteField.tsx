import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

/** Lunghezza massima del motivo del rifiuto (come la nota della richiesta). */
export const REJECT_NOTE_MAX = 500

interface RejectNoteFieldProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

/** Motivo facoltativo del rifiuto, con il contatore dei caratteri: lo usano il dialog dell'elenco e la conferma del dettaglio. */
const RejectNoteField = ({ value, onChange, disabled = false }: RejectNoteFieldProps) => {
  const { t } = useTranslation()
  const fieldId = useId()
  const hintId = useId()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={fieldId}>{t('leave.reject.label')}</Label>
      <Textarea id={fieldId} value={value} maxLength={REJECT_NOTE_MAX} disabled={disabled} aria-describedby={hintId} onChange={(event) => onChange(event.target.value)} />
      <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
        <p id={hintId}>{t('leave.reject.hint', { max: REJECT_NOTE_MAX })}</p>
        <p className="tabular-nums">{t('leave.reject.counter', { count: value.length, max: REJECT_NOTE_MAX })}</p>
      </div>
    </div>
  )
}

export default RejectNoteField
