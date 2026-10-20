<?php

namespace App\Enums;

use App\Support\Translate;

/**
 * Unità di una richiesta di assenza (fase 3, spec §3.1): giorni, mezza giornata, ore.
 */
enum LeaveUnit: string
{
    case Days = 'days';
    case HalfDay = 'half_day';
    case Hours = 'hours';

    public function label(): string
    {
        return Translate::text('enums.leave_unit.'.$this->value);
    }
}
