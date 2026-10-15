import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface YearSelectProps {
  id: string
  label: string
  value: number
  years: number[]
  onChange: (year: number) => void
}

/** Anno di chiusure e calendario: l'anno corrente, quello prima e i due dopo. */
const YearSelect = ({ id, label, value, years, onChange }: YearSelectProps) => (
  <div className="flex items-center gap-2">
    <Label id={`${id}-label`} htmlFor={id} className="font-normal text-muted-foreground">
      {label}
    </Label>
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))}>
      <SelectTrigger id={id} aria-labelledby={`${id}-label`} className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {years.map((year) => (
          <SelectItem key={year} value={String(year)}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)

export default YearSelect
