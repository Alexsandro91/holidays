import { LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfileHistory } from '@/features/history/api'
import HistoryList from '@/features/history/components/HistoryList'
import ProfileCard from '@/features/profile/components/ProfileCard'

/** Tappe visibili prima di "Mostra tutto" (spec §8.4) */
const PREVIEW = 5

/** Sposta il focus sulla tappa `index` appena compare (dopo il render): il pulsante premuto può sparire. */
const focusEntry = (container: HTMLElement | null, index: number) =>
  window.setTimeout(() => container?.querySelectorAll<HTMLElement>('li')[index]?.focus(), 0)

/** Storico dell'account nella colonna di destra del profilo, sotto Preferenze (spec SP2 fase 1 §8.4). */
const HistoryCard = () => {
  const { t } = useTranslation()
  const history = useProfileHistory()
  const [expanded, setExpanded] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const entries = history.data?.pages.flatMap((page) => page.data) ?? []
  const shown = expanded ? entries : entries.slice(0, PREVIEW)
  const canExpand = !expanded && (entries.length > PREVIEW || history.hasNextPage)

  const loadMore = async () => {
    const before = entries.length
    await history.fetchNextPage()
    focusEntry(listRef.current, before)
  }

  return (
    <ProfileCard titleId="profile-history-title" title={t('history.title')} description={t('history.description')}>
      {history.isPending ? (
        <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : history.isError ? (
        <div role="alert" className="grid justify-items-start gap-2">
          <p>{t('history.loadError')}</p>
          <Button variant="outline" onClick={() => void history.refetch()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground">{t('history.empty')}</p>
      ) : (
        <div className="grid gap-4">
          <div ref={listRef}>
            <HistoryList entries={shown} showActor={false} />
          </div>
          {canExpand && (
            <Button
              variant="outline"
              className="justify-self-start"
              onClick={() => {
                setExpanded(true)
                focusEntry(listRef.current, PREVIEW)
              }}
            >
              {t('history.showAll')}
            </Button>
          )}
          {expanded && history.hasNextPage && (
            <Button variant="outline" className="justify-self-start" disabled={history.isFetchingNextPage} onClick={() => void loadMore()}>
              {history.isFetchingNextPage && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {t('history.loadMore')}
            </Button>
          )}
        </div>
      )}
    </ProfileCard>
  )
}

export default HistoryCard
