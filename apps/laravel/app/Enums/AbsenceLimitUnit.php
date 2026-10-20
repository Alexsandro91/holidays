<?php

namespace App\Enums;

/**
 * Unità del tetto facoltativo di un tipo di assenza (spec §3.1).
 */
enum AbsenceLimitUnit: string
{
    case Days = 'days';
    case Hours = 'hours';
}
