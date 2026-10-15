<?php

namespace Tests\Feature\Locations;

use App\Enums\NonWorkingReason;
use App\Models\Closure;
use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Services\WorkCalendar;
use App\Support\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;
use Tests\TestCase;

class WorkCalendarTest extends TestCase
{
    use RefreshDatabase;

    private WorkCalendar $calendar;

    protected function setUp(): void
    {
        parent::setUp();
        app()->setLocale('it');
        $this->calendar = app(WorkCalendar::class);
    }

    public function test_a_standard_week_has_five_working_days_and_a_weekly_rest(): void
    {
        $location = Location::factory()->create();

        // Da lunedì 19 a domenica 25 ottobre 2026
        $days = $this->calendar->forLocation($location, $this->day('2026-10-19'), $this->day('2026-10-25'));

        $this->assertSame([480, 480, 480, 480, 480, 0, 0], $this->minutes($days));
        $this->assertTrue($days[0]->isWorking());
        $this->assertFalse($days[6]->isWorking());
        $this->assertSame([NonWorkingReason::WeeklyRest], $this->types($days[6]));
        $this->assertSame('2026-10-25', $days[6]->date->toDateString());
    }

    public function test_a_new_schedule_takes_over_from_its_first_day(): void
    {
        $location = Location::factory()->create();
        WorkSchedule::factory()->forLocation($location)->validFrom('2026-10-21')->minutes([240, 240, 240, 240, 240, 0, 0])->create();

        $days = $this->calendar->forLocation($location, $this->day('2026-10-19'), $this->day('2026-10-23'));

        $this->assertSame([480, 480, 240, 240, 240], $this->minutes($days));
    }

    public function test_the_oldest_schedule_also_covers_the_days_before_it(): void
    {
        $location = Location::factory()->create();
        $location->schedules()->delete();
        WorkSchedule::factory()->forLocation($location)->validFrom('2026-10-21')->minutes([240, 240, 240, 240, 240, 0, 0])->create();

        $this->assertSame([240, 240], $this->minutes($this->calendar->forLocation($location, $this->day('2026-10-19'), $this->day('2026-10-20'))));
    }

    public function test_a_personal_schedule_wins_until_it_follows_the_location_again(): void
    {
        $user = User::factory()->create();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-10-01')->minutes([240, 240, 240, 0, 0, 0, 0])->create();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-10-22')->followsLocation()->create();

        // Lunedì 19 - venerdì 23: part-time fino a mercoledì, poi di nuovo l'orario della sede da giovedì 22
        $days = $this->calendar->forUser($user, $this->day('2026-10-19'), $this->day('2026-10-23'));

        $this->assertSame([240, 240, 240, 480, 480], $this->minutes($days));
    }

    public function test_before_any_personal_schedule_the_location_schedule_applies(): void
    {
        $milano = Location::factory()->create();
        WorkSchedule::factory()->forLocation($milano)->validFrom('2026-01-01')->minutes([420, 420, 420, 420, 420, 240, 0])->create();
        $user = User::factory()->at($milano)->create();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-10-24')->minutes([240, 240, 240, 240, 240, 0, 0])->create();

        $days = $this->calendar->forUser($user, $this->day('2026-10-23'), $this->day('2026-10-24'));

        // Venerdì 23 con l'orario di Milano; da sabato 24 vale l'orario personale, che il sabato non lavora
        $this->assertSame([420, 0], $this->minutes($days));
        $this->assertSame([NonWorkingReason::WeeklyRest], $this->types($days[1]));
    }

    public function test_the_patron_closes_the_location_with_its_name(): void
    {
        $milano = Location::factory()->withPatron(7, 12)->create(['name' => 'Milano']);

        // Lunedì 7 dicembre 2026
        [$day] = $this->calendar->forLocation($milano, $this->day('2026-12-07'), $this->day('2026-12-07'));

        $this->assertSame(0, $day->minutes);
        $this->assertSame([NonWorkingReason::Patron], $this->types($day));
        $this->assertSame('Patrono (Milano)', $day->reasons[0]['label']);
        $this->assertTrue(collect($this->calendar->forLocation(Location::factory()->create(), $this->day('2026-12-07'), $this->day('2026-12-07')))->first()?->isWorking());
    }

    public function test_a_day_with_several_reasons_lists_them_all_once(): void
    {
        $milano = Location::factory()->withPatron(7, 12)->create(['name' => 'Milano']);
        Closure::factory()->between('2026-08-10', '2026-08-16')->create(['description' => 'Chiusura estiva']);
        Closure::factory()->forLocation($milano)->between('2026-08-14', '2026-08-14')->create(['description' => 'Ponte']);
        Closure::factory()->forLocation(Location::factory()->create())->between('2026-08-13', '2026-08-13')->create(['description' => 'Altra sede']);

        $days = collect($this->calendar->forLocation($milano, $this->day('2026-08-13'), $this->day('2026-08-15')))->keyBy(fn (WorkDay $day): string => $day->date->toDateString());

        $this->assertSame([NonWorkingReason::Closure], $this->types($days['2026-08-13']));
        $this->assertSame(['Chiusura estiva'], array_column($days['2026-08-13']->reasons, 'label'));
        $this->assertSame(['Chiusura estiva', 'Ponte'], array_column($days['2026-08-14']->reasons, 'label'));
        // Sabato di Ferragosto dentro la chiusura: riposo, festivo e chiusura, ognuno una volta
        $this->assertSame([NonWorkingReason::WeeklyRest, NonWorkingReason::NationalHoliday, NonWorkingReason::Closure], $this->types($days['2026-08-15']));
        $this->assertSame('Ferragosto', $days['2026-08-15']->reasons[1]['label']);

        // Patrono di domenica (7 dicembre 2025): riposo e patrono, nessun giorno perso o contato due volte
        [$sunday] = $this->calendar->forLocation($milano, $this->day('2025-12-07'), $this->day('2025-12-07'));
        $this->assertSame([NonWorkingReason::WeeklyRest, NonWorkingReason::Patron], $this->types($sunday));
    }

    public function test_liberation_day_and_easter_monday_together_are_both_listed(): void
    {
        [$day] = $this->calendar->forLocation(Location::factory()->create(), $this->day('2011-04-25'), $this->day('2011-04-25'));

        $this->assertSame([NonWorkingReason::NationalHoliday, NonWorkingReason::NationalHoliday], $this->types($day));
        $this->assertSame(['Festa della Liberazione', 'Lunedì dell’Angelo'], array_column($day->reasons, 'label'));
    }

    public function test_an_interval_spanning_two_years_uses_both_years_holidays(): void
    {
        $days = $this->calendar->forLocation(Location::factory()->create(), $this->day('2026-12-31'), $this->day('2027-01-01'));

        $this->assertTrue($days[0]->isWorking());
        $this->assertSame([NonWorkingReason::NationalHoliday], $this->types($days[1]));
    }

    public function test_intervals_longer_than_a_leap_year_or_reversed_are_refused(): void
    {
        $location = Location::factory()->create();

        $this->assertCount(366, $this->calendar->forLocation($location, $this->day('2028-01-01'), $this->day('2028-12-31')));

        foreach ([['2026-01-01', '2027-01-02'], ['2026-10-20', '2026-10-19']] as [$from, $to]) {
            try {
                $this->calendar->forLocation($location, $this->day($from), $this->day($to));
                $this->fail("{$from} → {$to}: expected InvalidArgumentException");
            } catch (InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_today_in_the_location_timezone_near_midnight_uses_that_days_schedule_and_closure(): void
    {
        // 22:30 UTC del 20 ottobre: a Roma è già 00:30 del 21
        $this->travelTo(CarbonImmutable::parse('2026-10-20 22:30:00', 'UTC'));
        $location = Location::factory()->create(['timezone' => 'Europe/Rome']);
        WorkSchedule::factory()->forLocation($location)->validFrom('2026-10-21')->minutes([240, 240, 240, 240, 240, 0, 0])->create();
        Closure::factory()->forLocation($location)->between('2026-10-21', '2026-10-21')->create(['description' => 'Ponte']);
        Closure::factory()->forLocation($location)->between('2026-10-22', '2026-10-22')->create(['description' => 'Altro ponte']);

        $today = CarbonImmutable::now('Europe/Rome');
        $days = $this->calendar->forLocation($location, $today, $today->addDay());

        $this->assertSame('2026-10-21', $days[0]->date->toDateString());
        $this->assertSame(['Ponte'], array_column($days[0]->reasons, 'label'));
        $this->assertSame(['Altro ponte'], array_column($days[1]->reasons, 'label'));

        // Senza chiusure, il 21 vale già il nuovo orario (4 ore), non quello del giorno prima
        Closure::query()->delete();
        $this->assertSame([240, 240], $this->minutes($this->calendar->forLocation($location, $today, $today->addDay())));
    }

    public function test_the_number_of_queries_does_not_grow_with_the_interval(): void
    {
        $user = User::factory()->create();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-03-01')->minutes([240, 240, 240, 240, 240, 0, 0])->create();
        Closure::factory()->create();

        $count = function (string $to) use ($user): int {
            DB::flushQueryLog();
            DB::enableQueryLog();
            $this->calendar->forUser($user->fresh() ?? $user, $this->day('2026-01-01'), $this->day($to));
            DB::disableQueryLog();

            return count(DB::getQueryLog());
        };

        $this->assertSame($count('2026-01-07'), $count('2026-12-31'));
    }

    private function day(string $date): CarbonImmutable
    {
        return CarbonImmutable::parse($date);
    }

    /**
     * @param  list<WorkDay>  $days
     * @return list<int>
     */
    private function minutes(array $days): array
    {
        return array_map(fn (WorkDay $day): int => $day->minutes, $days);
    }

    /**
     * @return list<NonWorkingReason>
     */
    private function types(WorkDay $day): array
    {
        return array_column($day->reasons, 'type');
    }
}
