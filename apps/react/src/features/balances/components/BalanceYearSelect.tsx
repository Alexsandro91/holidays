import { useTranslation } from 'react-i18next'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface BalanceYearSelectProps {
  year: number
  onChange: (year: number) => void
}

const YEARS_SHOWN = 5

/** Selettore dell'anno dei saldi: l'anno in corso e i quattro precedenti. */
const BalanceYearSelect = ({ year, onChange }: BalanceYearSelectProps) => {
  const { t } = useTranslation()
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: YEARS_SHOWN }, (_, index) => currentYear - index)

  return (
    <div className="grid gap-1">
      <Label htmlFor="balances-year">{t('balances.dialog.year')}</Label>
      <Select value={String(year)} onValueChange={(next) => onChange(years.find((item) => String(item) === next) ?? currentYear)}>
        <SelectTrigger id="balances-year" className="w-28">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper">
          {years.map((item) => (
            <SelectItem key={item} value={String(item)}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default BalanceYearSelect
