<?php

namespace App\Enums;

use App\Support\Translate;

/**
 * Stato di una richiesta di assenza (fase 3, spec §4).
 */
enum LeaveRequestStatus: string
{
    case Pending = 'pending';
    case Approved = 'approved';
    case Rejected = 'rejected';
    case Withdrawn = 'withdrawn';
    case CancellationRequested = 'cancellation_requested';
    case Cancelled = 'cancelled';

    public function label(): string
    {
        return Translate::text('enums.leave_request_status.'.$this->value);
    }

    /**
     * Richiesta ancora in corso: occupa i giorni e conta per le sovrapposizioni.
     */
    public function isActive(): bool
    {
        return match ($this) {
            self::Pending, self::Approved, self::CancellationRequested => true,
            default => false,
        };
    }

    /**
     * Richiesta che pesa sul saldo con i movimenti `usage`.
     */
    public function chargesBalance(): bool
    {
        return match ($this) {
            self::Approved, self::CancellationRequested => true,
            default => false,
        };
    }
}
