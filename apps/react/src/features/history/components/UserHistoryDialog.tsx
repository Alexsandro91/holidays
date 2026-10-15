import { LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useUserHistory } from '@/features/history/api'
import HistoryList from '@/features/history/components/HistoryList'
import type { ManagedUser } from '@/features/users/api'
import { isApiError } from '@/lib/api'
import { focusTrigger, USER_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface UserHistoryDialogProps {
  user: ManagedUser | null
  onClose: () => void
}

const HistoryBody = ({ userId }: { userId: number }) => {
  const { t } = useTranslation()
  const history = useUserHistory(userId)
  const listRef = useRef<HTMLDivElement>(null)
  const entries = history.data?.pages.flatMap((page) => page.data) ?? []

  const loadMore = async () => {
    const before = entries.length
    await history.fetchNextPage()
    // La nuova tappa riceve il focus: chi usa la tastiera continua a leggere da lì
    window.setTimeout(() => listRef.current?.querySelectorAll<HTMLElement>('li')[before]?.focus(), 0)
  }

  if (history.isPending) {
    return (
      <div className="grid gap-2" role="status" aria-busy="true" aria-label={t('common.loading')}>
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (history.isError) {
    // 404: la persona non è più visibile (es. spostata in un'altra sede)
    return <p role="alert">{isApiError(history.error) && history.error.status === 404 ? t('history.notVisible') : t('history.loadError')}</p>
  }

  if (entries.length === 0) return <p className="text-muted-foreground">{t('history.empty')}</p>

  return (
    <div className="grid gap-4">
      <div ref={listRef} className="max-h-[60vh] overflow-y-auto pr-1">
        <HistoryList entries={entries} showActor />
      </div>
      {history.hasNextPage && (
        <Button variant="outline" className="justify-self-start" disabled={history.isFetchingNextPage} onClick={() => void loadMore()}>
          {history.isFetchingNextPage && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t('history.loadMore')}
        </Button>
      )}
    </div>
  )
}

/** Storico di una persona dal menu di riga di Utenti, con chi ha agito (spec SP2 fase 1 §8.4). */
const UserHistoryDialog = ({ user, onClose }: UserHistoryDialogProps) => {
  const { t } = useTranslation()
  // Nome conservato durante l'animazione di chiusura
  const [last, setLast] = useState<ManagedUser | null>(user)
  if (user !== null && user !== last) setLast(user)
  const shown = user ?? last

  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(USER_TRIGGER_ATTRIBUTE, shown?.id ?? null)
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('history.dialogTitle', { name: shown?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('history.dialogDescription')}</DialogDescription>
        </DialogHeader>
        {user !== null && <HistoryBody key={user.id} userId={user.id} />}
      </DialogContent>
    </Dialog>
  )
}

export default UserHistoryDialog
