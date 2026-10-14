import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const DEBOUNCE_MS = 300
// Limite dell'API per i filtri di testo (spec §3): oltre risponderebbe 422
const MAX_LENGTH = 100

interface TextFilterProps {
  id: string
  label: string
  /** Valore nell'URL */
  value: string
  /** Chiamata 300 ms dopo l'ultima battuta */
  onCommit: (value: string) => void
}

/** Campo di filtro con debounce: il testo segue l'URL (Indietro, Avanti, "Azzera filtri") senza effect. */
const TextFilter = ({ id, label, value, onCommit }: TextFilterProps) => {
  const [draft, setDraft] = useState(value)
  // Il campo si riallinea all'URL durante il render quando l'URL cambia da fuori
  const [synced, setSynced] = useState(value)
  if (synced !== value) {
    setSynced(value)
    setDraft(value)
  }

  useEffect(() => {
    if (draft === value) return
    const timer = window.setTimeout(() => onCommit(draft), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draft, value, onCommit])

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input id={id} type="search" maxLength={MAX_LENGTH} autoComplete="off" value={draft} onChange={(event) => setDraft(event.target.value)} className="pl-9" />
      </div>
    </div>
  )
}

export default TextFilter
