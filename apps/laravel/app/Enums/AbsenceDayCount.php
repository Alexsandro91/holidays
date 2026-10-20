<?php

namespace App\Enums;

/**
 * Come si contano i giorni di un tipo di assenza (spec §3.1): lavorativi o di calendario.
 */
enum AbsenceDayCount: string
{
    case Working = 'working';
    case Calendar = 'calendar';
}
