import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import type { UserListParams } from '@/features/users/api'

export type TextFilterField = 'search' | 'firstName' | 'lastName' | 'email'

type SetParams = (next: Partial<UserListParams>, options?: { replace?: boolean }) => void

/**
 * Testi dei filtri ancora in debounce: non vanno mai persi. Qualunque altra modifica dell'URL (scheda, ruolo,
 * ordinamento, pagina, commit di un altro campo) passa da `apply`, che li applica insieme. Si scartano solo con
 * Indietro/Avanti (navigazione POP) e con "Azzera filtri": in quei casi cambia `resetKey` e i campi tornano all'URL.
 */
export const useTextDrafts = (params: UserListParams, setParams: SetParams) => {
  // Letto e svuotato solo nei gestori di evento e negli effect, mai durante il render
  const pending = useRef<Partial<Record<TextFilterField, string>>>({})
  const location = useLocation()
  const navigationType = useNavigationType()
  const [resetKey, setResetKey] = useState(0)
  const [seenKey, setSeenKey] = useState(location.key)
  // Indietro/Avanti: i campi tornano ai valori dell'URL (aggiornamento durante il render, senza effect)
  if (seenKey !== location.key) {
    setSeenKey(location.key)
    if (navigationType === 'POP') setResetKey(resetKey + 1)
  }
  useEffect(() => {
    if (navigationType === 'POP') pending.current = {}
  }, [location.key, navigationType])

  /** Testo scritto in un campo: in sospeso finché è diverso dal valore nell'URL. */
  const track = useCallback(
    (field: TextFilterField, value: string) => {
      if (value === params[field]) delete pending.current[field]
      else pending.current[field] = value
    },
    [params],
  )

  const apply = useCallback<SetParams>(
    (next, options) => {
      const texts = pending.current
      pending.current = {}
      // Con un testo in sospeso i filtri cambiano: si riparte dalla prima pagina
      const hasTexts = Object.keys(texts).length > 0
      setParams({ ...texts, ...next, ...(hasTexts ? { page: 1 } : {}) }, options)
    },
    [setParams],
  )

  /** "Azzera filtri": i testi in sospeso si scartano e i campi si svuotano. */
  const discard = useCallback(() => {
    pending.current = {}
    setResetKey((key) => key + 1)
  }, [])

  return { apply, track, discard, resetKey }
}
