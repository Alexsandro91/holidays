<?php

namespace Tests\Feature\Locations;

use App\Models\Closure;
use App\Models\Location;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Chiusure aziendali (spec §2.4, §4.3): solo admin.
 */
class ClosureApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Location $milano;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = User::factory()->admin()->create();
        $this->milano = Location::factory()->create(['name' => 'Milano']);
    }

    public function test_only_admins_manage_closures(): void
    {
        $closure = Closure::factory()->create();
        $routes = [
            ['GET', '/api/closures?year=2026'],
            ['POST', '/api/closures'],
            ['PATCH', "/api/closures/{$closure->id}"],
            ['DELETE', "/api/closures/{$closure->id}"],
        ];

        foreach ($routes as [$method, $uri]) {
            $this->json($method, $uri)->assertUnauthorized();
        }

        foreach ([User::factory()->create(), User::factory()->manager()->create()] as $user) {
            foreach ($routes as [$method, $uri]) {
                $this->actingAs($user)->json($method, $uri)->assertForbidden();
            }
        }

        $this->assertModelExists($closure);
    }

    public function test_an_unknown_closure_is_a_404_for_the_admin(): void
    {
        $this->actingAs($this->admin)->patchJson('/api/closures/999999', ['description' => 'x'])->assertNotFound();
        $this->actingAs($this->admin)->deleteJson('/api/closures/999999')->assertNotFound();
    }

    public function test_lists_the_closures_touching_a_year_for_a_location_and_for_everyone(): void
    {
        Closure::factory()->between('2026-12-28', '2027-01-03')->create(['description' => 'Natale']);
        Closure::factory()->forLocation($this->milano)->between('2026-08-10', '2026-08-14')->create(['description' => 'Estate Milano']);
        Closure::factory()->forLocation(Location::factory()->create())->between('2026-08-10', '2026-08-14')->create(['description' => 'Altrove']);
        Closure::factory()->between('2025-08-10', '2025-08-14')->create(['description' => 'Anno scorso']);

        $this->actingAs($this->admin)->getJson("/api/closures?year=2026&filter[location]={$this->milano->id}")
            ->assertOk()
            ->assertJsonPath('data.*.description', ['Estate Milano', 'Natale'])
            ->assertJsonPath('data.0.location_name', 'Milano')
            ->assertJsonPath('data.0.starts_on', '2026-08-10')
            ->assertJsonPath('data.1.location_id', null)
            ->assertJsonPath('data.1.location_name', null);
        $this->actingAs($this->admin)->getJson('/api/closures?year=2027')->assertOk()->assertJsonPath('data.*.description', ['Natale']);
        $this->actingAs($this->admin)->getJson('/api/closures?year=2026')->assertOk()->assertJsonCount(3, 'data');
        $this->actingAs($this->admin)->getJson('/api/closures')->assertUnprocessable()->assertJsonValidationErrors('year');
    }

    public function test_an_admin_creates_a_closure_for_one_location_or_explicitly_for_all(): void
    {
        $this->actingAs($this->admin)->postJson('/api/closures', ['location_id' => $this->milano->id, 'starts_on' => '2026-08-10', 'ends_on' => '2026-08-14', 'description' => ' Chiusura estiva '])
            ->assertCreated()
            ->assertJsonPath('data.location_name', 'Milano')
            ->assertJsonPath('data.description', 'Chiusura estiva')
            ->assertJsonPath('data.ends_on', '2026-08-14');
        $this->actingAs($this->admin)->postJson('/api/closures', ['location_id' => null, 'starts_on' => '2026-12-24', 'ends_on' => '2026-12-24', 'description' => 'Vigilia'])
            ->assertCreated()
            ->assertJsonPath('data.location_id', null);
        // Senza dire per quale sede: 422, mai "tutte" per sbaglio
        $this->actingAs($this->admin)->postJson('/api/closures', ['starts_on' => '2026-12-31', 'ends_on' => '2026-12-31', 'description' => 'San Silvestro'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('location_id');
        // Una sede archiviata si può ancora configurare
        $this->actingAs($this->admin)->postJson('/api/closures', ['location_id' => Location::factory()->archived()->create()->id, 'starts_on' => '2026-12-31', 'ends_on' => '2026-12-31', 'description' => 'San Silvestro'])
            ->assertCreated();
    }

    public function test_a_closure_lasts_at_most_31_days_and_never_ends_before_it_starts(): void
    {
        $base = ['location_id' => null, 'description' => 'Chiusura'];

        $this->actingAs($this->admin)->postJson('/api/closures', [...$base, 'starts_on' => '2026-08-01', 'ends_on' => '2026-08-31'])->assertCreated();
        $this->actingAs($this->admin)->postJson('/api/closures', [...$base, 'starts_on' => '2026-08-01', 'ends_on' => '2026-09-01'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ends_on');
        $this->actingAs($this->admin)->postJson('/api/closures', [...$base, 'starts_on' => '2026-08-10', 'ends_on' => '2026-08-09'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ends_on');
        $this->actingAs($this->admin)->postJson('/api/closures', [...$base, 'starts_on' => '2026-08-10', 'ends_on' => '2026-08-10', 'description' => str_repeat('a', 101)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('description');
        $this->actingAs($this->admin)->postJson('/api/closures', [...$base, 'starts_on' => '2026-08-10', 'ends_on' => '2026-08-10', 'description' => 'Ponte <b>'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('description');

        $this->assertSame(1, Closure::query()->count());
    }

    public function test_an_update_keeps_what_it_does_not_change_and_checks_the_whole_interval(): void
    {
        $closure = Closure::factory()->forLocation($this->milano)->between('2026-08-10', '2026-08-14')->create();

        $this->actingAs($this->admin)->patchJson("/api/closures/{$closure->id}", ['description' => 'Ferie estive'])
            ->assertOk()
            ->assertJsonPath('data.description', 'Ferie estive')
            ->assertJsonPath('data.starts_on', '2026-08-10')
            ->assertJsonPath('data.location_name', 'Milano');
        $this->actingAs($this->admin)->patchJson("/api/closures/{$closure->id}", ['ends_on' => '2026-08-09'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ends_on');
        $this->actingAs($this->admin)->patchJson("/api/closures/{$closure->id}", ['ends_on' => '2026-09-15'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('ends_on');
        $this->actingAs($this->admin)->patchJson("/api/closures/{$closure->id}", ['location_id' => null])
            ->assertOk()
            ->assertJsonPath('data.location_id', null);
    }

    public function test_an_admin_deletes_a_closure(): void
    {
        $closure = Closure::factory()->create();

        $this->actingAs($this->admin)->deleteJson("/api/closures/{$closure->id}")->assertNoContent();

        $this->assertModelMissing($closure);
    }
}
