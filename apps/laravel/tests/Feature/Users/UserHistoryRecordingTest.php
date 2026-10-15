<?php

namespace Tests\Feature\Users;

use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserHistoryEvent;
use App\Models\Invitation;
use App\Models\Location;
use App\Models\User;
use App\Models\UserHistory;
use App\Services\InvitationService;
use App\Services\UserHistoryRecorder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

/**
 * Ogni flusso che crea, attiva o cambia ruolo o stato di una persona lascia esattamente una tappa (spec §8).
 */
class UserHistoryRecordingTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->admin = User::factory()->admin()->create();
    }

    public function test_an_invitation_records_role_type_and_location(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', ['first_name' => 'Sara', 'last_name' => 'Colombo', 'email' => 'sara@example.test', 'role' => 'manager'])->assertCreated();

        $invited = User::query()->where('email', 'sara@example.test')->sole();
        $entry = $this->onlyEntryOf($invited);
        $this->assertSame(UserHistoryEvent::Invited, $entry->event);
        // MySQL riordina le chiavi della colonna JSON: si confronta il contenuto, non l'ordine
        $this->assertEquals(['role' => 'manager', 'employment_type' => 'employee', 'location_id' => Location::primary()->id], $entry->context);
        $this->assertSame($this->admin->id, $entry->actor_id);
    }

    public function test_an_admin_invitation_records_the_admin_role(): void
    {
        $this->actingAs($this->admin)->postJson('/api/administrators/invitations', ['first_name' => 'Nora', 'last_name' => 'Neri', 'email' => 'nora@example.test', 'current_password' => 'password'])->assertCreated();

        $entry = $this->onlyEntryOf(User::query()->where('email', 'nora@example.test')->sole());
        $this->assertSame(UserHistoryEvent::Invited, $entry->event);
        $this->assertSame('admin', $entry->context['role'] ?? null);
    }

    public function test_the_first_admin_from_the_terminal_has_no_actor(): void
    {
        $this->artisan('app:create-admin', ['first_name' => 'Giulia', 'last_name' => 'Rossi', 'email' => 'giulia@example.test', '--force' => true])->assertSuccessful();

        $entry = $this->onlyEntryOf(User::query()->where('email', 'giulia@example.test')->sole());
        $this->assertSame(UserHistoryEvent::Invited, $entry->event);
        $this->assertEquals('employee', $entry->context['employment_type'] ?? null);
        $this->assertNull($entry->actor_id);
    }

    public function test_accepting_the_invitation_records_the_activation_by_the_person(): void
    {
        $invitation = Invitation::factory()->create();

        $user = app(InvitationService::class)->accept($invitation, 'una-frase-lunga-e-nuova', Request::create('/'));

        $this->assertNotNull($user);
        $entry = $this->onlyEntryOf($user);
        $this->assertSame(UserHistoryEvent::Activated, $entry->event);
        $this->assertSame($user->id, $entry->actor_id);
    }

    public function test_a_role_change_records_both_roles_and_the_same_role_records_nothing(): void
    {
        $employee = User::factory()->create();

        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}/role", ['role' => 'manager'])->assertOk();
        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}/role", ['role' => 'manager'])->assertOk();

        $entry = $this->onlyEntryOf($employee);
        $this->assertSame(UserHistoryEvent::RoleChanged, $entry->event);
        $this->assertSame(['employee', 'manager'], [$entry->old_value, $entry->new_value]);
        $this->assertSame($this->admin->id, $entry->actor_id);
    }

    public function test_promotion_and_revocation_are_role_changes(): void
    {
        $manager = User::factory()->manager()->create();

        $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => $manager->id, 'current_password' => 'password'])->assertOk();
        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$manager->id}", ['role' => 'employee', 'current_password' => 'password'])->assertOk();

        $entries = UserHistory::query()->where('user_id', $manager->id)->orderBy('id')->get();
        $this->assertSame([['manager', 'admin'], ['admin', 'employee']], $entries->map(fn (UserHistory $entry): array => [$entry->old_value, $entry->new_value])->all());
        $this->assertSame([UserHistoryEvent::RoleChanged, UserHistoryEvent::RoleChanged], $entries->pluck('event')->all());
    }

    public function test_disabling_and_enabling_are_recorded_and_a_refused_action_records_nothing(): void
    {
        $employee = User::factory()->create();

        $this->actingAs($this->admin)->postJson("/api/users/{$employee->id}/disable")->assertOk();
        // Già disattivato: 409, nessuna tappa
        $this->actingAs($this->admin)->postJson("/api/users/{$employee->id}/disable")->assertConflict();
        $this->actingAs($this->admin)->postJson("/api/users/{$employee->id}/enable")->assertOk();

        $this->assertSame(
            [UserHistoryEvent::Disabled, UserHistoryEvent::Enabled],
            UserHistory::query()->where('user_id', $employee->id)->orderBy('id')->pluck('event')->all(),
        );
    }

    public function test_the_recorder_skips_changes_to_the_same_value(): void
    {
        $user = User::factory()->create();
        $recorder = app(UserHistoryRecorder::class);

        $recorder->roleChanged($user, Role::Employee, Role::Employee, $this->admin);
        $recorder->employmentTypeChanged($user, EmploymentType::Intern, EmploymentType::Intern, $this->admin);
        $recorder->locationChanged($user, $user->location_id, $user->location_id, $this->admin);

        $this->assertDatabaseCount('user_history', 0);

        $recorder->employmentTypeChanged($user, EmploymentType::Intern, EmploymentType::Employee, null);
        $this->assertSame(['intern', 'employee'], [$this->onlyEntryOf($user)->old_value, $this->onlyEntryOf($user)->new_value]);
    }

    private function onlyEntryOf(User $user): UserHistory
    {
        return UserHistory::query()->where('user_id', $user->id)->sole();
    }
}
