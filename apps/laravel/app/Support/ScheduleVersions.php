<?php

namespace App\Support;

use App\Models\WorkSchedule;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * Scelta pura della versione dell'orario in vigore un giorno (spec §2.3, §3.1): la personale valida quel giorno, a meno
 * che riporti alla sede; altrimenti la standard della sede valida quel giorno, e la più vecchia della sede vale anche
 * prima del suo inizio. Lavora su versioni già caricate: nessuna query.
 */
final class ScheduleVersions
{
    /**
     * @param  Collection<int, WorkSchedule>  $personal  versioni della persona, ordinate per `valid_from`
     * @param  Collection<int, WorkSchedule>  $standard  versioni della sede, ordinate per `valid_from`
     */
    public static function on(CarbonInterface $date, Collection $personal, Collection $standard): ?WorkSchedule
    {
        $own = self::startedOn($date, $personal);

        if ($own !== null && ! $own->follows_location) {
            return $own;
        }

        return self::startedOn($date, $standard) ?? $standard->first();
    }

    /**
     * Ultima versione iniziata entro quel giorno.
     *
     * @param  Collection<int, WorkSchedule>  $versions  ordinate per `valid_from`
     */
    public static function startedOn(CarbonInterface $date, Collection $versions): ?WorkSchedule
    {
        $day = $date->toDateString();

        return $versions->last(fn (WorkSchedule $version): bool => $version->valid_from->toDateString() <= $day);
    }
}
