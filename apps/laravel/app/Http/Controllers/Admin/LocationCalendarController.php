<?php

namespace App\Http\Controllers\Admin;

use App\Enums\NonWorkingReason;
use App\Http\Controllers\Controller;
use App\Http\Requests\Locations\LocationCalendarRequest;
use App\Http\Resources\LocationCalendarResource;
use App\Models\Location;
use App\Models\WorkSchedule;
use App\Services\WorkCalendar;
use App\Support\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Calendario dell'anno di una sede (spec §3.2), per controllare a colpo d'occhio festivi, patrono e chiusure.
 */
final class LocationCalendarController extends Controller
{
    public function __invoke(LocationCalendarRequest $request, Location $location, WorkCalendar $calendar): LocationCalendarResource
    {
        $year = $request->integer('year');
        // Date di calendario costruite nel fuso della sede
        $days = $calendar->forLocation(
            $location,
            CarbonImmutable::create($year, 1, 1, 0, 0, 0, $location->timezone),
            CarbonImmutable::create($year, 12, 31, 0, 0, 0, $location->timezone),
        );
        $versions = $location->schedules()->orderBy('valid_from')->get()
            ->each(fn (WorkSchedule $schedule) => $schedule->setRelation('location', $location));

        return new LocationCalendarResource([
            'year' => $year,
            'schedules' => $this->versionsIn($versions, $year),
            // Il solo riposo settimanale non si elenca: la risposta dà l'orario di ogni versione
            'days' => array_values(array_filter($days, fn (WorkDay $day): bool => collect($day->reasons)->contains(
                fn (array $reason): bool => $reason['type'] !== NonWorkingReason::WeeklyRest,
            ))),
        ]);
    }

    /**
     * Versioni in vigore almeno un giorno dell'anno. La più vecchia copre anche i giorni prima del suo inizio.
     *
     * @param  Collection<int, WorkSchedule>  $versions  ordinate per `valid_from`
     * @return Collection<int, WorkSchedule>
     */
    private function versionsIn(Collection $versions, int $year): Collection
    {
        $first = "{$year}-01-01";
        $last = "{$year}-12-31";
        $inYear = $versions->filter(function (WorkSchedule $version, int $index) use ($versions, $first, $last): bool {
            $next = $versions->get($index + 1);

            return $version->valid_from->toDateString() <= $last && ($next === null || $next->valid_from->toDateString() > $first);
        })->values();

        return $inYear->isEmpty() && $versions->isNotEmpty() ? collect([$versions->first()]) : $inYear;
    }
}
