<?php

namespace App\Support\Holidays;

use InvalidArgumentException;

/**
 * Calcolatore dei festivi per il paese di una sede. Oggi solo l'Italia (spec §1): un paese nuovo si aggiunge qui.
 */
final class HolidayCalendars
{
    public static function for(string $country): HolidayCalendar
    {
        return match ($country) {
            'IT' => new ItalianHolidayCalendar,
            default => throw new InvalidArgumentException("No holiday calendar for country {$country}."),
        };
    }
}
