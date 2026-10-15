<?php

namespace App\Services;

use App\Enums\NonWorkingReason;
use App\Models\Closure as CompanyClosure;
use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Support\Holidays\HolidayCalendars;
use App\Support\Translate;
use App\Support\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use InvalidArgumentException;

/**
 * Unico punto che calcola i giorni lavorativi (spec §3.1): saldi, richieste e calendario del team passeranno da qui.
 * Un giorno è lavorativo se l'orario valido quel giorno ha minuti e non è festivo nazionale, patrono o chiusura.
 */
final class WorkCalendar
{
    public const MAX_DAYS = 366;

    /**
     * Giorni di una persona: il suo orario personale, se c'è, altrimenti quello della sua sede attuale.
     *
     * @return list<WorkDay>
     */
    public function forUser(User $user, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $this->ensureValidInterval($from, $to);

        /** @var Collection<int, WorkSchedule> $personal */
        $personal = $user->schedules()->where('valid_from', '<=', $to->toDateString())->orderBy('valid_from')->get();

        // Sede attuale (spec §3.1): per i giorni passati varrà lo snapshot delle richieste (fase 3)
        return $this->build($user->location()->firstOrFail(), $from, $to, $personal);
    }

    /**
     * Giorni di una sede con il suo orario standard.
     *
     * @return list<WorkDay>
     */
    public function forLocation(Location $location, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $this->ensureValidInterval($from, $to);

        return $this->build($location, $from, $to, new Collection);
    }

    /**
     * @param  Collection<int, WorkSchedule>  $personal
     * @return list<WorkDay>
     */
    private function build(Location $location, CarbonImmutable $from, CarbonImmutable $to, Collection $personal): array
    {
        $from = $from->startOfDay();
        $to = $to->startOfDay();
        // Tutte le versioni della sede (poche): la più vecchia vale anche per i giorni prima del suo inizio
        $standard = $location->schedules()->orderBy('valid_from')->get();
        $closures = CompanyClosure::query()
            ->where(fn (Builder $query) => $query->whereNull('location_id')->orWhere('location_id', $location->id))
            ->where('starts_on', '<=', $to->toDateString())
            ->where('ends_on', '>=', $from->toDateString())
            ->orderBy('starts_on')
            ->orderBy('id')
            ->get();
        $holidays = $this->nationalHolidays($location->country, $from->year, $to->year);
        $days = [];

        for ($date = $from; $date->lessThanOrEqualTo($to); $date = $date->addDay()) {
            $day = $date->toDateString();
            $scheduled = $this->scheduledMinutes($date, $standard, $personal);
            $reasons = [];

            if ($scheduled === 0) {
                $reasons[] = ['type' => NonWorkingReason::WeeklyRest, 'label' => Translate::text('holidays.weekly_rest')];
            }

            foreach ($holidays[$day] ?? [] as $key) {
                $reasons[] = ['type' => NonWorkingReason::NationalHoliday, 'label' => Translate::text($key)];
            }

            if ($location->hasPatron() && $date->day === $location->patron_day && $date->month === $location->patron_month) {
                $reasons[] = ['type' => NonWorkingReason::Patron, 'label' => Translate::text('holidays.patron', ['location' => $location->name])];
            }

            foreach ($closures as $closure) {
                if ($day >= $closure->starts_on->toDateString() && $day <= $closure->ends_on->toDateString()) {
                    $reasons[] = ['type' => NonWorkingReason::Closure, 'label' => $closure->description];
                }
            }

            $days[] = new WorkDay($date, $reasons === [] ? $scheduled : 0, $reasons);
        }

        return $days;
    }

    /**
     * @param  Collection<int, WorkSchedule>  $standard
     * @param  Collection<int, WorkSchedule>  $personal
     */
    private function scheduledMinutes(CarbonImmutable $date, Collection $standard, Collection $personal): int
    {
        $own = $this->versionOn($date, $personal);

        if ($own !== null && ! $own->follows_location) {
            return $own->minutesOn($date);
        }

        return ($this->versionOn($date, $standard) ?? $standard->first())?->minutesOn($date) ?? 0;
    }

    /**
     * Ultima versione iniziata entro quel giorno.
     *
     * @param  Collection<int, WorkSchedule>  $versions  ordinate per `valid_from`
     */
    private function versionOn(CarbonImmutable $date, Collection $versions): ?WorkSchedule
    {
        $day = $date->toDateString();

        return $versions->last(fn (WorkSchedule $version): bool => $version->valid_from->toDateString() <= $day);
    }

    /**
     * @return array<string, list<string>>
     */
    private function nationalHolidays(string $country, int $fromYear, int $toYear): array
    {
        $calendar = HolidayCalendars::for($country);
        $holidays = [];

        for ($year = $fromYear; $year <= $toYear; $year++) {
            $holidays += $calendar->holidays($year);
        }

        return $holidays;
    }

    private function ensureValidInterval(CarbonImmutable $from, CarbonImmutable $to): void
    {
        $from = $from->startOfDay();
        $to = $to->startOfDay();

        if ($to->lessThan($from) || (int) $from->diffInDays($to) + 1 > self::MAX_DAYS) {
            throw new InvalidArgumentException('The interval must be between 1 and '.self::MAX_DAYS.' days.');
        }
    }
}
