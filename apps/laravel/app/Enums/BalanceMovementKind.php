<?php

namespace App\Enums;

use App\Support\Translate;

/**
 * Natura di un movimento di saldo (spec §5). `Usage` è riservato alla fase 3 (richieste approvate).
 */
enum BalanceMovementKind: string
{
    case Accrual = 'accrual';
    case Adjustment = 'adjustment';
    case Alignment = 'alignment';
    case Usage = 'usage';

    public function label(): string
    {
        return Translate::text('enums.balance_movement_kind.'.$this->value);
    }
}
