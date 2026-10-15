<?php

namespace Tests\Feature\Locations;

use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Services\LocationService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Sezione Sedi (spec §4.2): solo admin.
 */
class LocationApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->admin()->create();
    }

    public function test_guests_get_401_non_admins_403_and_unknown_ids_404_on_every_location_route(): void
    {
        $location = Location::factory()->create();
        $id = $location->id;
        $scheduleId = WorkSchedule::factory()->forLocation($location)->validFrom('2099-01-01')->create()->id;
        $routes = [
            ['GET', '/api/locations'],
            ['GET', '/api/locations/options'],
            ['POST', '/api/locations'],
            ['GET', "/api/locations/{$id}"],
            ['PATCH', "/api/locations/{$id}"],
            ['POST', "/api/locations/{$id}/primary"],
            ['POST', "/api/locations/{$id}/archive"],
            ['POST', "/api/locations/{$id}/restore"],
            ['GET', "/api/locations/{$id}/schedules"],
            ['POST', "/api/locations/{$id}/schedules"],
            ['DELETE', "/api/locations/{$id}/schedules/{$scheduleId}"],
            ['GET', "/api/locations/{$id}/calendar?year=2026"],
        ];

        foreach ($routes as [$method, $uri]) {
            $this->json($method, $uri)->assertUnauthorized();
        }

        foreach ([User::factory()->create(), User::factory()->manager()->create()] as $user) {
            foreach ($routes as [$method, $uri]) {
                $this->actingAs($user)->json($method, $uri)->assertForbidden();
            }
        }

        $this->assertModelExists(WorkSchedule::query()->findOrFail($scheduleId));

        $missing = [
            ['GET', '/api/locations/999999'],
            ['PATCH', '/api/locations/999999'],
            ['POST', '/api/locations/999999/primary'],
            ['POST', '/api/locations/999999/archive'],
            ['POST', '/api/locations/999999/restore'],
            ['GET', '/api/locations/999999/schedules'],
            ['POST', '/api/locations/999999/schedules'],
            ['DELETE', "/api/locations/999999/schedules/{$scheduleId}"],
            ['DELETE', "/api/locations/{$id}/schedules/999999"],
            ['GET', '/api/locations/999999/calendar?year=2026'],
        ];

        foreach ($missing as [$method, $uri]) {
            $this->actingAs($this->admin)->json($method, $uri)->assertNotFound();
        }
    }

    public function test_lists_active_locations_with_their_people_and_active_managers(): void
    {
        $milano = Location::factory()->create(['name' => 'Milano']);
        User::factory()->at($milano)->count(2)->create();
        User::factory()->manager()->at($milano)->create();
        User::factory()->manager()->disabled()->at($milano)->create();
        Location::factory()->archived()->create(['name' => 'Torino']);

        $this->actingAs($this->admin)->getJson('/api/locations')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Milano')
            ->assertJsonPath('data.0.users_count', 4)
            ->assertJsonPath('data.0.managers_count', 1)
            ->assertJsonPath('data.0.is_primary', false)
            ->assertJsonPath('data.1.name', 'Sede principale')
            ->assertJsonPath('data.1.is_primary', true)
            ->assertJsonPath('meta.counts', ['active' => 2, 'archived' => 1])
            ->assertJsonMissingPath('data.0.current_schedule');

        $this->actingAs($this->admin)->getJson('/api/locations?filter[status]=archived')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Torino');
        $this->actingAs($this->admin)->getJson('/api/locations?sort=-name')->assertOk()->assertJsonPath('data.0.name', 'Sede principale');
        $this->actingAs($this->admin)->getJson('/api/locations?filter[status]=deleted')->assertUnprocessable();
    }

    public function test_options_list_only_active_locations_by_name(): void
    {
        $milano = Location::factory()->create(['name' => 'Milano']);
        Location::factory()->archived()->create(['name' => 'Torino']);

        $this->actingAs($this->admin)->getJson('/api/locations/options')
            ->assertOk()
            ->assertExactJson(['data' => [
                ['id' => $milano->id, 'name' => 'Milano', 'is_primary' => false],
                ['id' => Location::primary()->id, 'name' => 'Sede principale', 'is_primary' => true],
            ]]);
    }

    public function test_a_new_location_starts_with_the_schedule_the_primary_applies_today(): void
    {
        $this->travelTo(CarbonImmutable::parse('2030-06-03 10:00:00', 'Europe/Rome'));
        WorkSchedule::factory()->forLocation(Location::primary())->validFrom('2030-01-01')->minutes([450, 450, 450, 450, 420, 0, 0])->create();

        $response = $this->actingAs($this->admin)->postJson('/api/locations', ['name' => ' Milano ', 'city' => 'Milano', 'patron_day' => 7, 'patron_month' => 12])
            ->assertCreated()
            ->assertJsonPath('data.name', 'Milano')
            ->assertJsonPath('data.country', 'IT')
            ->assertJsonPath('data.timezone', 'Europe/Rome')
            ->assertJsonPath('data.patron_day', 7)
            ->assertJsonPath('data.is_primary', false)
            ->assertJsonPath('data.users_count', 0)
            ->assertJsonPath('data.current_schedule.minutes', [450, 450, 450, 450, 420, 0, 0])
            ->assertJsonPath('data.current_schedule.valid_from', '2030-06-03')
            ->assertJsonPath('data.current_schedule.is_started', true);

        // Un solo proprietario per riga (spec §2.3): la sede, mai una persona
        $rows = WorkSchedule::query()->where('location_id', $response->json('data.id'))->get();
        $this->assertCount(1, $rows);
        $this->assertNull($rows->sole()->user_id);
    }

    public function test_a_location_created_just_after_midnight_in_rome_starts_today_in_rome(): void
    {
        // Le 22:30 UTC del 14 giugno sono già le 00:30 del 15 a Roma
        $this->travelTo(CarbonImmutable::parse('2030-06-14 22:30:00', 'UTC'));

        $this->actingAs($this->admin)->postJson('/api/locations', ['name' => 'Milano'])
            ->assertCreated()
            ->assertJsonPath('data.current_schedule.valid_from', '2030-06-15')
            ->assertJsonPath('data.current_schedule.is_started', true);
    }

    public function test_names_are_unique_ignoring_case_archived_locations_included(): void
    {
        Location::factory()->archived()->create(['name' => 'Milano']);

        $this->actingAs($this->admin)->postJson('/api/locations', ['name' => 'MILANO'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');

        // Due richieste parallele superano entrambe la validazione: la seconda viola l'indice e diventa lo stesso 422
        try {
            app(LocationService::class)->create(['name' => 'milano'], $this->admin);
            $this->fail('Expected ValidationException');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('name', $exception->errors());
        }

        $this->assertSame(1, Location::query()->where('name', 'milano')->count());
    }

    public function test_the_patron_needs_a_day_and_a_month_that_exist_every_year(): void
    {
        $patrons = [
            ['patron_day' => 29, 'patron_month' => 2],
            ['patron_day' => 31, 'patron_month' => 4],
            ['patron_day' => 0, 'patron_month' => 12],
            ['patron_day' => 7],
            ['patron_month' => 12],
        ];

        foreach ($patrons as $index => $patron) {
            $this->actingAs($this->admin)->postJson('/api/locations', ['name' => "Sede {$index}", ...$patron])->assertUnprocessable();
        }

        $this->assertSame(1, Location::query()->count());
    }

    public function test_an_admin_renames_a_location_and_removes_its_patron(): void
    {
        $milano = Location::factory()->withPatron(7, 12)->create(['name' => 'Milano']);

        $this->actingAs($this->admin)->patchJson("/api/locations/{$milano->id}", ['name' => 'Milano Centro', 'patron_day' => null, 'patron_month' => null])
            ->assertOk()
            ->assertJsonPath('data.name', 'Milano Centro')
            ->assertJsonPath('data.patron_day', null)
            ->assertJsonPath('data.patron_month', null);
        $this->actingAs($this->admin)->patchJson("/api/locations/{$milano->id}", ['name' => 'Sede principale'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');
        // Il proprio nome, anche con maiuscole diverse, è ammesso
        $this->actingAs($this->admin)->patchJson("/api/locations/{$milano->id}", ['name' => 'milano centro'])->assertOk();
        $this->actingAs($this->admin)->patchJson("/api/locations/{$milano->id}", ['name' => 'Sede <b>'])->assertUnprocessable();
    }

    public function test_another_location_becomes_primary_but_never_an_archived_one(): void
    {
        $old = Location::primary();
        $milano = Location::factory()->create();

        $this->actingAs($this->admin)->postJson("/api/locations/{$milano->id}/primary")->assertOk()->assertJsonPath('data.is_primary', true);

        $this->assertTrue(Location::primary()->is($milano));
        $this->assertFalse($old->fresh()?->isPrimary());
        $this->assertSame(1, Location::query()->where('primary_marker', 1)->count());

        $archived = Location::factory()->archived()->create();
        $this->actingAs($this->admin)->postJson("/api/locations/{$archived->id}/primary")
            ->assertConflict()
            ->assertJsonPath('message', __('locations.archived', [], 'it'));
        $this->assertTrue(Location::primary()->is($milano));
    }

    public function test_a_location_is_archived_only_when_empty_and_never_if_primary(): void
    {
        Log::spy();
        $milano = Location::factory()->create();
        $invited = User::factory()->at($milano)->invited()->create();

        $this->actingAs($this->admin)->postJson("/api/locations/{$milano->id}/archive")
            ->assertConflict()
            ->assertJsonPath('message', __('locations.has_users', [], 'it'));

        $invited->delete();
        $this->actingAs($this->admin)->postJson("/api/locations/{$milano->id}/archive")
            ->assertOk()
            ->assertJsonPath('data.archived_at', fn (?string $archivedAt): bool => $archivedAt !== null);
        $this->actingAs($this->admin)->postJson('/api/locations/'.Location::primary()->id.'/archive')
            ->assertConflict()
            ->assertJsonPath('message', __('locations.primary', [], 'it'));
        $this->actingAs($this->admin)->postJson("/api/locations/{$milano->id}/restore")
            ->assertOk()
            ->assertJsonPath('data.archived_at', null);

        Log::shouldHaveReceived('info')->with('Location archived', ['location_id' => $milano->id, 'actor_id' => $this->admin->id])->once();
    }

    public function test_the_detail_shows_the_schedule_in_force_today(): void
    {
        $milano = Location::factory()->create();

        $this->actingAs($this->admin)->getJson("/api/locations/{$milano->id}")
            ->assertOk()
            ->assertJsonPath('data.current_schedule.valid_from', '2000-01-01')
            ->assertJsonPath('data.current_schedule.is_started', true);
    }
}
