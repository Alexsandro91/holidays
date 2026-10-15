import { useTranslation } from 'react-i18next'
import type { HistoryEntry } from '@/features/history/api'

interface HistoryListProps {
  entries: HistoryEntry[]
  /** Nome di chi ha agito: solo nella vista di admin e responsabili (spec §8.3) */
  showActor: boolean
}

/** Tappe dell'account come linea del tempo verticale: data, testo e, se serve, chi ha agito. */
const HistoryList = ({ entries, showActor }: HistoryListProps) => {
  const { t, i18n } = useTranslation()
  const format = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' })

  return (
    <ol className="grid gap-3">
      {entries.map((entry) => (
        // tabIndex -1: riceve il focus quando "Mostra tutto" o "Carica altre" fanno comparire nuove tappe
        <li key={entry.id} tabIndex={-1} className="grid gap-0.5 border-l-2 border-border pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <time dateTime={entry.occurred_at} className="text-sm text-muted-foreground">
            {format.format(new Date(entry.occurred_at))}
          </time>
          <span>{entry.summary}</span>
          {showActor && entry.actor_name !== null && <span className="text-sm text-muted-foreground">{t('history.by', { name: entry.actor_name })}</span>}
        </li>
      ))}
    </ol>
  )
}

export default HistoryList
