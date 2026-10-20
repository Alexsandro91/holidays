<?php

namespace App\Services;

use App\Models\Location;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * Ore settimanali di una persona o di una sede a un giorno, in minuti (spec §4.2). La versione dell'orario la sceglie
 * `WorkScheduleService`, la stessa del calendario.
 */
final class WeeklyMinutes
{
    public function __construct(private readonly WorkScheduleService $schedules) {}

    public function forUser(User $user, CarbonImmutable $day): int
    {
        $schedule = $this->schedules->currentForUser($user, $user->location()->firstOrFail(), $day);

        return $schedule === null ? 0 : array_sum($schedule->minutes());
    }

    public function forLocation(Location $location, CarbonImmutable $day): int
    {
        $schedule = $this->schedules->currentForLocation($location, $day);

        return $schedule === null ? 0 : array_sum($schedule->minutes());
    }

    /**
     * Ore settimanali divise per i giorni con minuti, arrotondate; 0 se non c'è nessun giorno lavorato.
     */
    public function averageDayMinutes(User $user, CarbonImmutable $day): int
    {
        $schedule = $this->schedules->currentForUser($user, $user->location()->firstOrFail(), $day);
        $worked = $schedule === null ? [] : array_filter($schedule->minutes(), fn (int $minutes): bool => $minutes > 0);

        return $worked === [] ? 0 : (int) round(array_sum($worked) / count($worked));
    }
}
