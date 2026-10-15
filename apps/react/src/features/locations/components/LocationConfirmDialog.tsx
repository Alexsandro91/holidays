import { LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useArchiveLocation, useMakePrimaryLocation, useRestoreLocation, type Location } from '@/features/locations/api'
import type { LocationAction } from '@/features/locations/components/LocationActionsMenu'
import { isApiError } from '@/lib/api'
import { focusTrigger, LOCATION_TRIGGER_ATTRIBUTE } from '@/lib/focusTrigger'

interface LocationConfirmDialogProps {
  location: Location | null
  action: LocationAction | null
  onClose: () => void
}

/** Motivo per cui una sede non si archivia (spec §4.2): principale o con persone. null se si può. */
const archiveBlock = (location: Location): 'primary' | 'users' | null => {
  if (location.is_primary) return 'primary'
  return location.users_count > 0 ? 'users' : null
}

interface ConfirmBodyProps {
  location: Location
  action: LocationAction
  onClose: () => void
  onBusyChange: (busy: boolean) => void
}

const ConfirmBody = ({ location, action, onClose, onBusyChange }: ConfirmBodyProps) => {
  const { t } = useTranslation()
  const primary = useMakePrimaryLocation()
  const archive = useArchiveLocation()
  const restore = useRestoreLocation()
  const [pending, setPending] = useState(false)
  // Evita il doppio invio: letto solo nei gestori di evento
  const submitting = useRef(false)
  const blocked = action === 'archive' ? archiveBlock(location) : null
  const texts = { name: location.name, count: location.users_count }

  if (blocked !== null) {
    return (
      <>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('locations.confirm.archive.blockedTitle', texts)}</AlertDialogTitle>
          <AlertDialogDescription>
            {blocked === 'primary' ? t('locations.confirm.archive.blockedPrimary') : t('locations.confirm.archive.blockedUsers', texts)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('locations.confirm.archive.understood')}</AlertDialogCancel>
        </AlertDialogFooter>
      </>
    )
  }

  const run = () => {
    switch (action) {
      case 'primary':
        return primary.mutateAsync(location.id)
      case 'archive':
        return archive.mutateAsync(location.id)
      case 'restore':
        return restore.mutateAsync(location.id)
    }
  }

  const confirm = async () => {
    if (submitting.current) return
    submitting.current = true
    setPending(true)
    onBusyChange(true)
    try {
      await run()
    } catch (error) {
      submitting.current = false
      setPending(false)
      // 409 (es. persone aggiunte nel frattempo): il messaggio del server è già tradotto, la lista si ricarica
      toast.error(isApiError(error, 'network') ? t('errors.network') : isApiError(error) ? error.message : t('errors.generic'))
      onClose()
      return
    } finally {
      onBusyChange(false)
    }
    toast.success(t(`locations.confirm.${action}.done`, texts))
    onClose()
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>{t(`locations.confirm.${action}.title`, texts)}</AlertDialogTitle>
        <AlertDialogDescription>{t(`locations.confirm.${action}.description`, texts)}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>{t('locations.confirm.back')}</AlertDialogCancel>
        <Button variant={action === 'archive' ? 'destructive' : 'default'} disabled={pending} onClick={() => void confirm()}>
          {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {t(`locations.confirm.${action}.action`, texts)}
        </Button>
      </AlertDialogFooter>
    </>
  )
}

/** Conferma delle azioni di riga sulle sedi; per Archivia, se non si può, spiega il motivo. */
const LocationConfirmDialog = ({ location, action, onClose }: LocationConfirmDialogProps) => {
  const open = location !== null && action !== null
  // Contenuto conservato durante l'animazione di chiusura
  const [last, setLast] = useState<{ location: Location; action: LocationAction } | null>(null)
  if (location !== null && action !== null && (last?.location !== location || last.action !== action)) setLast({ location, action })
  const shown = open ? { location, action } : last
  // Conta le aperture: ogni apertura rimonta il corpo
  const [openCount, setOpenCount] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setOpenCount(openCount + 1)
  }
  // Durante l'invio il dialog non si chiude (Escape, clic fuori)
  const [busy, setBusy] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          focusTrigger(LOCATION_TRIGGER_ATTRIBUTE, shown?.location.id ?? null)
        }}
      >
        {shown && <ConfirmBody key={`${openCount}-${shown.location.id}-${shown.action}`} location={shown.location} action={shown.action} onClose={onClose} onBusyChange={setBusy} />}
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default LocationConfirmDialog
