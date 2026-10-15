<?php

namespace App\Enums;

/**
 * Perché un giorno non è lavorativo (spec §3.1).
 */
enum NonWorkingReason: string
{
    case WeeklyRest = 'weekly_rest';
    case NationalHoliday = 'national_holiday';
    case Patron = 'patron';
    case Closure = 'closure';
}
