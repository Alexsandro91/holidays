<?php

namespace App\Services;

use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Support\ScheduleVersions;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

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

    /**
     * Orari di più persone a un giorno con query costanti (le versioni personali e quelle delle sedi, in blocco), con
     * la stessa scelta di versione di `forUser`. Le persone devono avere `location_id`.
     *
     * @param  Collection<int, User>  $users
     * @return array<int, array{weekly: int, location_weekly: int, average_day: int}>
     */
    public function forUsers(Collection $users, CarbonImmutable $day): array
    {
        if ($users->isEmpty()) {
            return [];
        }

        $personal = WorkSchedule::query()
            ->whereIn('user_id', $users->pluck('id')->all())
            ->where('valid_from', '<=', $day->toDateString())
            ->orderBy('valid_from')
            ->get()
            ->groupBy('user_id');
        $standard = WorkSchedule::query()
            ->whereIn('location_id', $users->pluck('location_id')->unique()->all())
            ->orderBy('valid_from')
            ->get()
            ->groupBy('location_id');
        $none = new Collection;
        $result = [];

        foreach ($users as $user) {
            $locationVersions = $standard->get($user->location_id, $none);
            $own = ScheduleVersions::on($day, $personal->get($user->id, $none), $locationVersions);
            $location = ScheduleVersions::on($day, $none, $locationVersions);
            $minutes = $own === null ? [] : $own->minutes();
            $worked = array_filter($minutes, fn (int $value): bool => $value > 0);

            $result[$user->id] = [
                'weekly' => array_sum($minutes),
                'location_weekly' => $location === null ? 0 : array_sum($location->minutes()),
                'average_day' => $worked === [] ? 0 : (int) round(array_sum($worked) / count($worked)),
            ];
        }

        return $result;
    }
}
