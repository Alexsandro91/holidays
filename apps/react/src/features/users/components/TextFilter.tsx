import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { MAX_TEXT_FILTER } from '@/features/users/useUserListParams'
import { cn } from '@/lib/utils'

const DEBOUNCE_MS = 300

interface TextFilterProps {
  id: string
  label: string
  /** Valore nell'URL */
  value: string
  /** Chiamata 300 ms dopo l'ultima battuta */
  onCommit: (value: string) => void
  /** Chiamata a ogni battuta: il testo resta in sospeso finché non è applicato (vedi useTextDrafts) */
  onDraft: (value: string) => void
  /**
   * Cambia con Indietro, Avanti e "Azzera filtri": il testo ancora in debounce si scarta e il campo torna al valore
   * dell'URL, anche se quel valore non è cambiato
   */
  resetKey: number
  placeholder?: string
  className?: string
}

/** Campo di filtro con debounce: il testo segue l'URL senza effect. */
const TextFilter = ({ id, label, value, onCommit, onDraft, resetKey, placeholder, className }: TextFilterProps) => {
  const [draft, setDraft] = useState(value)
  // Il campo si riallinea all'URL durante il render, senza effect:
  // - con Indietro, Avanti o "Azzera filtri" (resetKey) sempre, scartando il testo in sospeso;
  // - quando cambia solo il valore, se non c'è testo in sospeso. Se c'è, il valore nuovo è un testo scritto qui e
  //   applicato insieme a un'altra modifica (useTextDrafts): le battute arrivate nel frattempo non vanno perse
  const [synced, setSynced] = useState({ value, resetKey })
  if (synced.value !== value || synced.resetKey !== resetKey) {
    setSynced({ value, resetKey })
    if (synced.resetKey !== resetKey || draft === synced.value) setDraft(value)
  }

  useEffect(() => {
    if (draft === value) return
    const timer = window.setTimeout(() => onCommit(draft), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [draft, value, onCommit])

  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          id={id}
          type="search"
          maxLength={MAX_TEXT_FILTER}
          autoComplete="off"
          placeholder={placeholder}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            onDraft(event.target.value)
          }}
          className="pl-9"
        />
      </div>
    </div>
  )
}

export default TextFilter
