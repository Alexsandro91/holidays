import type { TFunction } from 'i18next'
import { z } from 'zod'

/** Email dei form di accesso: spazi tolti, obbligatoria e ben formata. */
export const emailField = (t: TFunction) => z.string().trim().min(1, t('validation.emailRequired')).pipe(z.email(t('validation.emailInvalid')))

/** Stato di navigazione con l'email da precompilare (WCAG 3.3.7: niente dati da reinserire). */
export const emailStateSchema = z.object({ email: z.string() })
