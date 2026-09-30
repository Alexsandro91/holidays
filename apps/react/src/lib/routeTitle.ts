import { useMatches } from 'react-router'
import { z } from 'zod'

const handleSchema = z.object({ titleKey: z.string() })

/** Chiave di traduzione del titolo della route più interna che lo dichiara in `handle.titleKey`. */
export const useRouteTitleKey = (): string | null => {
  const matches = useMatches()
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const parsed = handleSchema.safeParse(matches[index].handle)
    if (parsed.success) return parsed.data.titleKey
  }
  return null
}
