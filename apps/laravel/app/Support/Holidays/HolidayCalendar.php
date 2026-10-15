<?php

namespace App\Support\Holidays;

/**
 * Festivi nazionali di un paese (spec §2.5): calcolati, non salvati in tabella.
 */
interface HolidayCalendar
{
    public const MIN_YEAR = 2000;

    public const MAX_YEAR = 2100;

    /**
     * Festivi dell'anno, in ordine di data: data `Y-m-d` → chiavi di traduzione dei festivi di quel giorno (possono
     * essere più d'uno, es. 25 aprile e Pasquetta nel 2011).
     *
     * @return array<string, list<string>>
     */
    public function holidays(int $year): array;
}
