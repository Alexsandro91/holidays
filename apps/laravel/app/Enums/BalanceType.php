<?php

namespace App\Enums;

use App\Support\Translate;

/**
 * Saldo che matura e si consuma (fase 2, spec §2): ferie, ROL, ex festività.
 */
enum BalanceType: string
{
    case Vacation = 'vacation';
    case Rol = 'rol';
    case ExHolidays = 'ex_holidays';

    public function label(): string
    {
        return Translate::text('enums.balance_type.'.$this->value);
    }

    /**
     * Colonna di `accrual_settings` con il monte annuo di questo saldo.
     */
    public function settingColumn(): string
    {
        return $this->value.'_minutes';
    }
}
