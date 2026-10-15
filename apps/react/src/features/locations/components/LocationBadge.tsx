import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type LocationBadgeKind = 'primary' | 'noManager' | 'allLocations' | 'archived'

interface LocationBadgeProps {
  kind: LocationBadgeKind
}

// Colori di significato (token in index.css, contrasto AA nei due temi): principale e "tutte le sedi" nel primario
// tenue, nessun responsabile in ambra come un avviso, archiviata in grigio come uno stato spento
const CLASSES: Record<LocationBadgeKind, string> = {
  primary: 'bg-primary-soft text-primary-soft-foreground',
  noManager: 'bg-status-invited text-status-invited-foreground',
  allLocations: 'bg-primary-soft text-primary-soft-foreground',
  archived: 'bg-status-disabled text-status-disabled-foreground',
}

/** Etichetta sempre in testo: il colore non è l'unico segnale. */
const LocationBadge = ({ kind }: LocationBadgeProps) => {
  const { t } = useTranslation()
  return (
    <Badge variant="secondary" data-kind={kind} className={cn(CLASSES[kind])}>
      {t(`locations.badges.${kind}`)}
    </Badge>
  )
}

export default LocationBadge
