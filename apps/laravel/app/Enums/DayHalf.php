<?php

namespace App\Enums;

use App\Support\Translate;

/**
 * Metà della giornata di una richiesta a mezza giornata.
 */
enum DayHalf: string
{
    case Morning = 'morning';
    case Afternoon = 'afternoon';

    public function label(): string
    {
        return Translate::text('enums.day_half.'.$this->value);
    }
}
