import type { Ref } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'

interface AbsenceTypeCheckboxFieldProps {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
  hint?: string
  ref?: Ref<HTMLButtonElement>
}

/** Casella con etichetta cliccabile e, se serve, un suggerimento collegato. */
const AbsenceTypeCheckboxField = ({ id, label, checked, onCheckedChange, disabled, invalid, describedBy, hint, ref }: AbsenceTypeCheckboxFieldProps) => (
  <Field orientation="horizontal" data-invalid={invalid ? true : undefined}>
    <Checkbox
      id={id}
      ref={ref}
      checked={checked}
      disabled={disabled}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy ?? (hint ? `${id}-hint` : undefined)}
      onCheckedChange={(next) => onCheckedChange(next === true)}
    />
    <div className="grid gap-0.5">
      <FieldLabel htmlFor={id} className="font-normal">
        {label}
      </FieldLabel>
      {hint && <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>}
    </div>
  </Field>
)

export default AbsenceTypeCheckboxField
