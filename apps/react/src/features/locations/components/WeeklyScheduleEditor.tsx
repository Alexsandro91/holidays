import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatMinutes, parseHours, WEEKDAYS } from '@/features/locations/scheduleFormat'

interface WeeklyScheduleEditorProps {
  /** Minuti per giorno, lunedì primo; 0 = non lavorativo */
  value: number[]
  /** Un giorno con ore non valide arriva come NaN: la settimana la valida chi usa l'editor (validateWeek) */
  onChange: (minutes: number[]) => void
  disabled?: boolean
}

/**
 * Orario della settimana (spec SP2 fase 1 §5.3): una spunta per i giorni lavorativi e le ore scritte come 8, 4:30 o 7,5.
 * Il testo resta quello scritto anche quando non è valido, così la persona lo corregge; l'errore compare lasciando il campo.
 */
const WeeklyScheduleEditor = ({ value, onChange, disabled = false }: WeeklyScheduleEditorProps) => {
  const { t } = useTranslation()
  const id = useId()
  const [drafts, setDrafts] = useState(() => value.map((minutes) => (minutes > 0 ? formatMinutes(minutes) : '')))
  const [touched, setTouched] = useState<boolean[]>(() => value.map(() => false))

  const emit = (index: number, minutes: number) => onChange(value.map((current, day) => (day === index ? minutes : current)))
  const setDraft = (index: number, text: string) => setDrafts((current) => current.map((item, day) => (day === index ? text : item)))
  const setDayTouched = (index: number, next: boolean) => setTouched((current) => current.map((item, day) => (day === index ? next : item)))

  const toggle = (index: number, working: boolean) => {
    // Un giorno appena attivato parte da 8 ore, il valore più comune
    setDraft(index, working ? '8' : '')
    setDayTouched(index, false)
    emit(index, working ? 480 : 0)
  }

  const type = (index: number, text: string) => {
    setDraft(index, text)
    const minutes = parseHours(text)
    // Un giorno lavorativo ha almeno un quarto d'ora: per non lavorare si toglie la spunta
    emit(index, minutes === null || minutes === 0 ? Number.NaN : minutes)
  }

  return (
    <ul className="grid gap-2">
      {WEEKDAYS.map((day, index) => {
        const minutes = value[index] ?? 0
        const working = minutes !== 0
        const dayName = t(`schedule.weekdays.${day}`)
        const checkboxId = `${id}-${day}`
        const errorId = `${id}-${day}-error`
        const invalid = working && (touched[index] ?? false) && Number.isNaN(minutes)
        return (
          <li key={day} className="grid min-h-9 grid-cols-[minmax(0,8rem)_minmax(0,1fr)] items-center gap-3">
            <div className="flex items-center gap-2">
              <Checkbox id={checkboxId} checked={working} disabled={disabled} onCheckedChange={(checked) => toggle(index, checked === true)} />
              <Label htmlFor={checkboxId}>{dayName}</Label>
            </div>
            {working ? (
              <div className="grid gap-1">
                <div className="flex items-center gap-2">
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    value={drafts[index] ?? ''}
                    disabled={disabled}
                    className="w-24"
                    aria-label={t('schedule.hoursFor', { day: dayName.toLowerCase() })}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? errorId : undefined}
                    onChange={(event) => type(index, event.target.value)}
                    onBlur={() => setDayTouched(index, true)}
                  />
                  <span aria-hidden="true" className="text-sm text-muted-foreground">
                    {t('schedule.hoursUnit')}
                  </span>
                </div>
                {invalid && <FieldError id={errorId}>{t('schedule.invalidHours')}</FieldError>}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">{t('schedule.nonWorking')}</span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default WeeklyScheduleEditor
