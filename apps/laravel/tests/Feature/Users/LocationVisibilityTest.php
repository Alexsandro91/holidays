<?php

namespace Tests\Feature\Users;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Models\Location;
use App\Models\User;
use App\Services\InvitationService;
use App\Services\UserManagementService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Tests\TestCase;

/**
 * Il responsabile vede e gestisce solo la sua sede, l'admin tutte (spec §4.1).
 */
class LocationVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private Location $milano;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->milano = Location::factory()->create(['name' => 'Milano']);
        // Nella sede principale
        $this->manager = User::factory()->manager()->create();
    }

    public function test_a_manager_lists_and_counts_only_the_people_of_their_location(): void
    {
        $colleague = User::factory()->create();
        $disabled = User::factory()->disabled()->create();
        User::factory()->at($this->milano)->create();
        User::factory()->at($this->milano)->invited()->create();

        $response = $this->actingAs($this->manager)->getJson('/api/users')->assertOk();

        $this->assertEqualsCanonicalizing([$this->manager->id, $colleague->id, $disabled->id], array_column($response->json('data'), 'id'));
        $response->assertJsonPath('meta.counts', ['all' => 3, 'active' => 2, 'invited' => 0, 'disabled' => 1]);
    }

    public function test_an_admin_lists_the_people_of_every_location(): void
    {
        $admin = User::factory()->admin()->create();
        $there = User::factory()->at($this->milano)->create();

        $response = $this->actingAs($admin)->getJson('/api/users')->assertOk();

        $this->assertEqualsCanonicalizing([$this->manager->id, $there->id], array_column($response->json('data'), 'id'));
    }

    public function test_a_manager_gets_404_on_every_route_about_a_person_of_another_location(): void
    {
        $stranger = User::factory()->at($this->milano)->create();
        $routes = collect(Route::getRoutes()->getRoutes())->filter(fn (RoutingRoute $route): bool => str_contains($route->uri(), '{user}'));

        $this->assertNotEmpty($routes);

        foreach ($routes as $route) {
            $method = collect($route->methods())->reject(fn (string $method): bool => $method === 'HEAD')->firstOrFail();
            // Gli altri parametri (es. `{schedule}`) con un id qualsiasi: la persona si risolve prima
            $uri = (string) preg_replace('/\{[^}]+\}/', '1', str_replace('{user}', (string) $stranger->id, $route->uri()));

            $this->actingAs($this->manager)
                ->json($method, '/'.$uri, ['role' => 'manager', 'first_name' => 'Sara', 'last_name' => 'Colombo', 'current_password' => 'password'])
                ->assertNotFound();
        }

        $this->assertSame(UserStatus::Active, $stranger->fresh()?->status);
        $this->assertSame(Role::Employee, $stranger->fresh()?->role);
    }

    public function test_a_manager_still_acts_on_the_people_of_their_location(): void
    {
        $colleague = User::factory()->create();

        $this->actingAs($this->manager)->patchJson("/api/users/{$colleague->id}", ['first_name' => 'Sara', 'last_name' => 'Colombo'])->assertOk();
        $this->actingAs($this->manager)->postJson("/api/users/{$colleague->id}/disable")->assertOk();
    }

    public function test_an_employee_still_gets_the_403_of_the_policy(): void
    {
        $employee = User::factory()->create();
        $stranger = User::factory()->at($this->milano)->create();

        $this->actingAs($employee)->postJson("/api/users/{$stranger->id}/disable")->assertForbidden();
    }

    public function test_the_policy_lets_a_manager_act_only_within_their_location(): void
    {
        $here = User::factory()->create();
        $there = User::factory()->at($this->milano)->create();
        $admin = User::factory()->admin()->create();

        $this->assertTrue(Gate::forUser($this->manager)->allows('update', $here));
        $this->assertTrue(Gate::forUser($this->manager)->allows('changeRole', $here));
        $this->assertFalse(Gate::forUser($this->manager)->allows('update', $there));
        $this->assertFalse(Gate::forUser($this->manager)->allows('changeRole', $there));
        $this->assertTrue(Gate::forUser($admin)->allows('update', $there));
        $this->assertTrue(Gate::forUser($admin)->allows('changeRole', $there));
    }

    public function test_a_person_moved_meanwhile_gives_the_manager_a_conflict(): void
    {
        $service = app(UserManagementService::class);
        $calls = [
            'disable' => fn (User $stale) => $service->disable($stale, $this->manager, request(), false),
            'change_role' => fn (User $stale) => $service->changeRole($stale, Role::Manager, $this->manager, request()),
            'password_reset' => fn (User $stale) => $service->sendPasswordReset($stale, $this->manager, request(), false),
            'resend' => fn (User $stale) => app(InvitationService::class)->resend($stale, $this->manager, request()),
        ];

        foreach ($calls as $action => $call) {
            $stale = $action === 'resend' ? User::factory()->invited()->create() : User::factory()->create();
            // L'admin l'ha appena spostata a Milano: l'istanza in memoria è ancora nella sede del responsabile
            User::query()->whereKey($stale->id)->update(['location_id' => $this->milano->id]);

            try {
                $call($stale);
                $this->fail("{$action}: expected ConflictHttpException");
            } catch (ConflictHttpException $exception) {
                $this->assertSame(__('users.state_changed'), $exception->getMessage());
            }

            $this->assertSame(Role::Employee, $stale->fresh()?->role);
        }

        $this->assertDatabaseCount('user_history', 0);
        Mail::assertNothingQueued();
    }

    public function test_a_manager_moved_meanwhile_gets_a_conflict_too(): void
    {
        $employee = User::factory()->create();
        User::query()->whereKey($this->manager->id)->update(['location_id' => $this->milano->id]);

        try {
            app(UserManagementService::class)->disable($employee, $this->manager, request(), false);
            $this->fail('Expected ConflictHttpException');
        } catch (ConflictHttpException $exception) {
            $this->assertSame(__('users.state_changed'), $exception->getMessage());
        }

        $this->assertSame(UserStatus::Active, $employee->fresh()?->status);
    }
}
