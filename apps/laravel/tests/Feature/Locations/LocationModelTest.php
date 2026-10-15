<?php

namespace Tests\Feature\Locations;

use App\Models\Closure;
use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LocationModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_migration_creates_the_primary_location_with_a_monday_to_friday_schedule(): void
    {
        $primary = Location::primary();

        $this->assertSame('Sede principale', $primary->name);
        $this->assertSame('IT', $primary->country);
        $this->assertSame('Europe/Rome', $primary->timezone);
        $this->assertTrue($primary->isPrimary());
        $this->assertFalse($primary->isArchived());
        $this->assertFalse($primary->hasPatron());

        $schedule = $primary->schedules()->sole();
        $this->assertSame([480, 480, 480, 480, 480, 0, 0], $schedule->minutes());
        $this->assertNull($schedule->user_id);
        $this->assertFalse($schedule->follows_location);
    }

    public function test_only_one_location_can_be_primary(): void
    {
        $this->expectException(UniqueConstraintViolationException::class);

        Location::factory()->primary()->create();
    }

    public function test_users_are_created_in_the_primary_location_unless_told_otherwise(): void
    {
        $milano = Location::factory()->create(['name' => 'Milano']);

        $this->assertTrue(User::factory()->create()->location->is(Location::primary()));
        $this->assertTrue(User::factory()->at($milano)->create()->location->is($milano));
        $this->assertSame(1, $milano->users()->count());
    }

    public function test_the_factory_location_has_a_standard_schedule_and_the_patron_state(): void
    {
        $location = Location::factory()->withPatron(7, 12)->create();

        $this->assertTrue($location->hasPatron());
        $this->assertSame(7, $location->patron_day);
        $this->assertSame(12, $location->patron_month);
        $this->assertSame('2000-01-01', $location->schedules()->sole()->valid_from->toDateString());
        $this->assertTrue(Location::factory()->archived()->create()->isArchived());
        $this->assertSame(1, Location::query()->active()->where('name', $location->name)->count());
    }

    public function test_a_schedule_gives_the_minutes_of_each_weekday_and_knows_when_it_started(): void
    {
        $schedule = WorkSchedule::factory()
            ->forLocation(Location::factory()->create())
            ->minutes([480, 480, 480, 480, 240, 0, 0])
            ->validFrom('2026-10-20')
            ->create();

        // 2026-10-23 è un venerdì, 2026-10-25 una domenica
        $this->assertSame(240, $schedule->minutesOn(CarbonImmutable::parse('2026-10-23')));
        $this->assertSame(0, $schedule->minutesOn(CarbonImmutable::parse('2026-10-25')));
        $this->assertFalse($schedule->isStarted(CarbonImmutable::parse('2026-10-19')));
        $this->assertTrue($schedule->isStarted(CarbonImmutable::parse('2026-10-20')));
    }

    public function test_personal_schedules_and_closures_belong_to_their_owner(): void
    {
        $user = User::factory()->create();
        $personal = WorkSchedule::factory()->forUser($user)->create();
        $closure = Closure::factory()->forLocation(Location::primary())->between('2026-08-10', '2026-08-14')->create();
        $everywhere = Closure::factory()->create();

        $this->assertTrue($user->schedules()->sole()->is($personal));
        $this->assertNull($personal->location_id);
        $this->assertTrue($closure->location?->is(Location::primary()));
        $this->assertSame('2026-08-14', $closure->ends_on->toDateString());
        $this->assertNull($everywhere->location_id);
    }
}
