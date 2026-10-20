import type { LeaveRequestStatus } from '@/features/leave/api'

/**
 * Colore di significato di ogni stato (token in index.css, contrasto AA nei due temi): in attesa giallo, approvata
 * verde, non approvata rosso, annullamento richiesto grigio azzurro; ritirata e annullata come "Disattivato".
 * Lo usano il badge e le richieste nel calendario: il colore non è mai l'unico segnale (c'è sempre il testo).
 */
export const LEAVE_STATUS_CLASSES: Record<LeaveRequestStatus, string> = {
  pending: 'bg-leave-pending text-leave-pending-foreground',
  approved: 'bg-leave-approved text-leave-approved-foreground',
  rejected: 'bg-leave-rejected text-leave-rejected-foreground',
  cancellation_requested: 'bg-leave-cancellation text-leave-cancellation-foreground',
  withdrawn: 'bg-status-disabled text-status-disabled-foreground',
  cancelled: 'bg-status-disabled text-status-disabled-foreground',
}

/** Righe diagonali dell'annullamento richiesto nel calendario (spec §7.2), leggere per non coprire il testo. */
export const CANCELLATION_STRIPES =
  'bg-[image:repeating-linear-gradient(135deg,transparent_0_5px,color-mix(in_oklab,currentColor_22%,transparent)_5px_8px)]'
