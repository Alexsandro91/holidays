<?php

namespace Tests\Feature\Balances;

use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Services\WeeklyMinutes;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Ore settimanali di una persona e di una sede a un giorno (spec §4.2).
 */
class WeeklyMinutesTest extends TestCase
{
    use RefreshDatabase;

    public function test_location_week(): void
    {
        $user = User::factory()->create();

        $service = app(WeeklyMinutes::class);

        $this->assertSame(2400, $service->forUser($user, CarbonImmutable::parse('2026-10-09')));
        $this->assertSame(2400, $service->forLocation($user->location, CarbonImmutable::parse('2026-10-09')));
    }

    public function test_personal_schedule_wins(): void
    {
        $user = User::factory()->create();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-10-10')->minutes([240, 240, 240, 240, 240, 0, 0])->create();

        $service = app(WeeklyMinutes::class);

        $this->assertSame(2400, $service->forUser($user, CarbonImmutable::parse('2026-10-09')));
        $this->assertSame(1200, $service->forUser($user, CarbonImmutable::parse('2026-10-10')));
        $this->assertSame(2400, $service->forLocation($user->location, CarbonImmutable::parse('2026-10-10')));
    }

    public function test_follows_location_returns_to_location_week(): void
    {
        $user = User::factory()->create();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-10-10')->minutes([240, 240, 240, 240, 240, 0, 0])->create();
        WorkSchedule::factory()->forUser($user)->validFrom('2026-11-01')->followsLocation()->create();

        $service = app(WeeklyMinutes::class);

        $this->assertSame(1200, $service->forUser($user, CarbonImmutable::parse('2026-10-31')));
        $this->assertSame(2400, $service->forUser($user, CarbonImmutable::parse('2026-11-01')));
    }

    public function test_location_oldest_version_applies_before_its_start(): void
    {
        $location = Location::factory()->create();
        $location->schedules()->delete();
        WorkSchedule::factory()->forLocation($location)->validFrom('2026-06-01')->minutes([360, 360, 360, 360, 360, 0, 0])->create();
        $user = User::factory()->at($location)->create();

        $this->assertSame(1800, app(WeeklyMinutes::class)->forUser($user, CarbonImmutable::parse('2026-01-15')));
    }

    public function test_average_day_minutes(): void
    {
        $user = User::factory()->create();
        $user->location->schedules()->delete();
        WorkSchedule::factory()->forLocation($user->location)->minutes([480, 480, 480, 0, 0, 0, 0])->create();
        $day = CarbonImmutable::parse('2026-10-09');

        $this->assertSame(480, app(WeeklyMinutes::class)->averageDayMinutes($user, $day));

        WorkSchedule::factory()->forUser($user)->validFrom('2026-10-01')->minutes([240, 240, 240, 240, 240, 0, 0])->create();

        $this->assertSame(240, app(WeeklyMinutes::class)->averageDayMinutes($user, $day));
    }

    public function test_for_users_matches_the_single_methods(): void
    {
        $plain = User::factory()->create();
        $partTime = User::factory()->create();
        WorkSchedule::factory()->forUser($partTime)->validFrom('2026-10-10')->minutes([240, 240, 240, 0, 0, 0, 0])->create();
        $back = User::factory()->create();
        WorkSchedule::factory()->forUser($back)->validFrom('2026-10-01')->minutes([240, 240, 240, 240, 240, 0, 0])->create();
        WorkSchedule::factory()->forUser($back)->validFrom('2026-11-01')->followsLocation()->create();
        $users = collect([$plain, $partTime, $back]);
        $service = app(WeeklyMinutes::class);

        foreach (['2026-10-09', '2026-10-10', '2026-11-02'] as $date) {
            $day = CarbonImmutable::parse($date);
            $batch = $service->forUsers($users, $day);

            foreach ($users as $user) {
                $this->assertSame([
                    'weekly' => $service->forUser($user, $day),
                    'location_weekly' => $service->forLocation($user->location, $day),
                    'average_day' => $service->averageDayMinutes($user, $day),
                ], $batch[$user->id], "{$date} user {$user->id}");
            }
        }
    }
}
