<?php

namespace Tests\Feature\Users;

use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserHistoryEvent;
use App\Models\Location;
use App\Models\User;
use App\Models\UserHistory;
use App\Services\UserHistoryRecorder;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Storico nel profilo e nel menu di riga di Utenti (spec §8.3).
 */
class UserHistoryApiTest extends TestCase
{
    use RefreshDatabase;

    private UserHistoryRecorder $recorder;

    private User $admin;

    private Location $milano;

    protected function setUp(): void
    {
        parent::setUp();
        $this->recorder = app(UserHistoryRecorder::class);
        $this->admin = User::factory()->admin()->create();
        $this->milano = Location::factory()->create(['name' => 'Milano']);
    }

    public function test_the_profile_shows_my_steps_newest_first_without_who_acted(): void
    {
        $user = User::factory()->intern()->create();
        $this->travelTo(CarbonImmutable::parse('2026-03-03 09:00:00'));
        $this->recorder->invited($user, $this->admin);
        $this->travelTo(CarbonImmutable::parse('2026-03-04 09:00:00'));
        $this->recorder->activated($user);
        $this->travelTo(CarbonImmutable::parse('2026-05-10 09:00:00'));
        $this->recorder->employmentTypeChanged($user, EmploymentType::Intern, EmploymentType::Employee, $this->admin);
        $this->travelTo(CarbonImmutable::parse('2026-06-01 09:00:00'));
        $this->recorder->locationChanged($user, Location::primary()->id, $this->milano->id, $this->admin);
        // La tappa di un'altra persona non compare
        $this->recorder->roleChanged(User::factory()->create(), Role::Employee, Role::Manager, $this->admin);

        $this->actingAs($user)->getJson('/api/profile/history')
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonPath('data.*.summary', [
                'Sede: Sede principale → Milano',
                'Tipo: Stagista → Dipendente',
                'Account attivato',
                'Invito come Stagista, Utente, sede Sede principale',
            ])
            ->assertJsonPath('data.*.actor_name', [null, null, null, null])
            ->assertJsonPath('data.3.event', 'invited')
            ->assertJsonPath('data.3.occurred_at', '2026-03-03T09:00:00+00:00');
    }

    public function test_the_profile_history_needs_a_session(): void
    {
        $this->getJson('/api/profile/history')->assertUnauthorized();
    }

    public function test_pages_hold_twenty_steps(): void
    {
        $user = User::factory()->create();

        foreach (range(1, 25) as $step) {
            $step % 2 === 1 ? $this->recorder->disabled($user, null) : $this->recorder->enabled($user, null);
        }

        $this->actingAs($user)->getJson('/api/profile/history')
            ->assertOk()
            ->assertJsonCount(20, 'data')
            ->assertJsonPath('meta.total', 25)
            ->assertJsonPath('meta.per_page', 20);
        $this->actingAs($user)->getJson('/api/profile/history?page=2')->assertOk()->assertJsonCount(5, 'data');
    }

    public function test_staff_see_who_acted_and_the_current_name_of_the_location(): void
    {
        $employee = User::factory()->create();
        $this->recorder->locationChanged($employee, Location::primary()->id, $this->milano->id, $this->admin);
        $this->recorder->roleChanged($employee, Role::Employee, Role::Manager, $this->admin);
        Location::query()->whereKey($this->milano->id)->update(['name' => 'Milano Centro']);

        $this->actingAs($this->admin)->getJson("/api/users/{$employee->id}/history")
            ->assertOk()
            ->assertJsonPath('data.*.actor_name', [$this->admin->name, $this->admin->name])
            ->assertJsonPath('data.*.summary', ['Ruolo: Utente → Responsabile', 'Sede: Sede principale → Milano Centro']);
    }

    public function test_a_manager_reads_the_history_only_within_their_location_and_never_of_an_admin(): void
    {
        $manager = User::factory()->manager()->create();
        $colleague = User::factory()->create();
        $stranger = User::factory()->at($this->milano)->create();

        $this->actingAs($manager)->getJson("/api/users/{$colleague->id}/history")->assertOk();
        $this->actingAs($manager)->getJson("/api/users/{$stranger->id}/history")->assertNotFound();
        $this->actingAs($manager)->getJson("/api/users/{$this->admin->id}/history")->assertForbidden();
        $this->actingAs($colleague)->getJson("/api/users/{$manager->id}/history")->assertForbidden();
    }

    public function test_every_step_has_a_text_in_english_too(): void
    {
        $user = User::factory()->create(['locale' => 'en']);
        (new UserHistory)->forceFill([
            'user_id' => $user->id,
            'event' => UserHistoryEvent::Imported,
            'context' => ['role' => 'employee', 'employment_type' => 'employee', 'location_id' => Location::primary()->id],
        ])->save();
        $this->recorder->invited($user, null);
        $this->recorder->activated($user);
        $this->recorder->roleChanged($user, Role::Employee, Role::Manager, null);
        $this->recorder->employmentTypeChanged($user, EmploymentType::Employee, EmploymentType::Contractor, null);
        $this->recorder->locationChanged($user, Location::primary()->id, $this->milano->id, null);
        $this->recorder->disabled($user, null);
        $this->recorder->enabled($user, null);

        $summaries = $this->actingAs($user)->getJson('/api/profile/history')->assertOk()->json('data.*.summary');

        $this->assertEqualsCanonicalizing([
            'In the app as Employee, User, location Sede principale',
            'Invited as Employee, User, location Sede principale',
            'Account activated',
            'Role: User → Manager',
            'Type: Employee → External contractor',
            'Location: Sede principale → Milano',
            'Account disabled',
            'Account enabled',
        ], $summaries);
    }
}
