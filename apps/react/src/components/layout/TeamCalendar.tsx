import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

// Ottobre 2026 inizia di giovedì: tre caselle vuote in testa (settimana da lunedì)
const LEADING_BLANKS = 3
const DAYS_IN_MONTH = 31
const LEAVE_DAYS = [12, 13, 14, 15, 16, 21, 22, 23]
const PERMIT_DAYS = [8, 29]
// 5 ottobre 2026 è un lunedì: da lì si ricavano le iniziali dei giorni nella lingua corrente
const MONDAY = new Date(2026, 9, 5)

/** Calendario decorativo del pannello di accesso: il contenuto utile è nella didascalia. */
const TeamCalendar = () => {
  const { t, i18n } = useTranslation()
  const weekdayFormat = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' })
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    weekdayFormat.format(new Date(MONDAY.getFullYear(), MONDAY.getMonth(), MONDAY.getDate() + index)),
  )
  const cells = [...Array.from({ length: LEADING_BLANKS }, () => null), ...Array.from({ length: DAYS_IN_MONTH }, (_, index) => index + 1)]

  return (
    <figure className="w-full max-w-sm">
      <div className="grid grid-cols-7 gap-1.5 text-center" aria-hidden="true">
        {weekdays.map((day, index) => (
          <span key={index} className="pb-1 text-[11px] font-semibold tracking-[0.08em] uppercase opacity-70">
            {day}
          </span>
        ))}
        {cells.map((day, index) => (
          <span
            key={index}
            className={cn(
              'flex aspect-square items-center justify-center rounded-md text-[13px] font-medium tabular-nums',
              day === null && 'invisible',
              day !== null && LEAVE_DAYS.includes(day) && 'bg-primary text-primary-foreground',
              day !== null && PERMIT_DAYS.includes(day) && 'border border-primary/70',
              day !== null && !LEAVE_DAYS.includes(day) && !PERMIT_DAYS.includes(day) && 'bg-card/55',
            )}
          >
            {day}
          </span>
        ))}
      </div>
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] opacity-85">
        <span className="font-semibold">{t('brand.calendar')}</span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" aria-hidden="true" />
          {t('brand.legendLeave')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-primary" aria-hidden="true" />
          {t('brand.legendPermit')}
        </span>
      </figcaption>
    </figure>
  )
}

export default TeamCalendar
