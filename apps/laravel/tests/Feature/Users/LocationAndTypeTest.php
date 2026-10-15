<?php

namespace Tests\Feature\Users;

use App\Enums\AdminChange;
use App\Enums\AuthEventType;
use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserHistoryEvent;
use App\Mail\AdminChangeMail;
use App\Models\AuthEvent;
use App\Models\Location;
use App\Models\User;
use App\Models\UserHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Sede e tipo di rapporto nell'invito, nella modifica, nella lista e nell'utente corrente (spec §4.5, §4.6, §7).
 */
class LocationAndTypeTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Location $milano;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->admin = User::factory()->admin()->create();
        $this->milano = Location::factory()->create(['name' => 'Milano']);
    }

    public function test_an_admin_invites_into_a_chosen_location_with_a_type(): void
    {
        $this->invite($this->admin, ['location_id' => $this->milano->id, 'employment_type' => 'contractor'])
            ->assertCreated()
            ->assertJsonPath('data.location', ['id' => $this->milano->id, 'name' => 'Milano'])
            ->assertJsonPath('data.employment_type', 'contractor')
            ->assertJsonPath('data.employment_type_label', 'Collaboratore esterno');

        $invited = User::query()->where('email', 'sara@example.test')->sole();
        $this->assertSame($this->milano->id, $invited->location_id);
        // assertEquals: MySQL riordina le chiavi della colonna JSON
        $this->assertEquals(
            ['role' => 'employee', 'employment_type' => 'contractor', 'location_id' => $this->milano->id],
            UserHistory::query()->where('user_id', $invited->id)->sole()->context,
        );
    }

    public function test_without_a_location_the_invitation_goes_to_the_primary_one_never_to_an_archived_one(): void
    {
        $this->invite($this->admin)
            ->assertCreated()
            ->assertJsonPath('data.location.id', Location::primary()->id)
            ->assertJsonPath('data.employment_type', 'employee');

        $archived = Location::factory()->archived()->create();
        $this->invite($this->admin, ['email' => 'altra@example.test', 'location_id' => $archived->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('location_id');
    }

    public function test_a_manager_invites_only_into_their_own_location(): void
    {
        $manager = User::factory()->manager()->at($this->milano)->create();

        $this->invite($manager)->assertCreated()->assertJsonPath('data.location.id', $this->milano->id);
        $this->invite($manager, ['email' => 'altra@example.test', 'location_id' => Location::primary()->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('location_id');
    }

    public function test_an_intern_can_only_have_the_base_role(): void
    {
        $this->invite($this->admin, ['employment_type' => 'intern', 'role' => 'manager'])->assertUnprocessable()->assertJsonValidationErrors('role');
        $this->invite($this->admin, ['employment_type' => 'intern'])->assertCreated();

        $intern = User::factory()->intern()->create();
        $this->actingAs($this->admin)->patchJson("/api/users/{$intern->id}/role", ['role' => 'manager'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');
        $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => $intern->id, 'current_password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('user_id');
        $this->actingAs($this->admin)->postJson('/api/administrators/invitations', ['first_name' => 'Nora', 'last_name' => 'Neri', 'email' => 'nora@example.test', 'employment_type' => 'intern', 'current_password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('employment_type');

        $manager = User::factory()->manager()->create();
        $this->actingAs($this->admin)->patchJson("/api/users/{$manager->id}", ['first_name' => $manager->first_name, 'last_name' => $manager->last_name, 'employment_type' => 'intern'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('employment_type');

        $this->assertSame(Role::Employee, $intern->fresh()?->role);
        $this->assertSame(EmploymentType::Employee, $manager->fresh()?->employment_type);
        $this->assertSame('Uno stagista può avere solo il ruolo Utente.', __('users.intern_role', [], 'it'));
    }

    public function test_an_admin_moves_a_person_and_changes_the_type_leaving_one_entry_each(): void
    {
        $employee = User::factory()->create();
        $payload = ['first_name' => $employee->first_name, 'last_name' => $employee->last_name, 'location_id' => $this->milano->id, 'employment_type' => 'contractor'];

        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}", $payload)
            ->assertOk()
            ->assertJsonPath('data.location.name', 'Milano')
            ->assertJsonPath('data.employment_type', 'contractor');

        $entries = UserHistory::query()->where('user_id', $employee->id)->orderBy('id')->get();
        $this->assertSame([UserHistoryEvent::EmploymentTypeChanged, UserHistoryEvent::LocationChanged], $entries->pluck('event')->all());
        $this->assertSame([(string) Location::primary()->id, (string) $this->milano->id], [$entries[1]->old_value, $entries[1]->new_value]);
        $this->assertSame($this->admin->id, $entries[1]->actor_id);
        $this->assertEqualsCanonicalizing(['employment_type', 'location_id'], AuthEvent::query()->where('event', AuthEventType::UserUpdated)->sole()->changed_fields);

        // Stessi valori: nessuna tappa e nessun evento in più
        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}", $payload)->assertOk();
        $this->assertSame(2, UserHistory::query()->where('user_id', $employee->id)->count());
        $this->assertSame(1, AuthEvent::query()->where('event', AuthEventType::UserUpdated)->count());
    }

    public function test_only_an_admin_moves_people_and_only_to_active_locations(): void
    {
        $manager = User::factory()->manager()->create();
        $employee = User::factory()->create();
        $names = ['first_name' => 'Sara', 'last_name' => 'Colombo'];

        $this->actingAs($manager)->patchJson("/api/users/{$employee->id}", [...$names, 'location_id' => $this->milano->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('location_id');
        $this->actingAs($this->admin)->patchJson("/api/users/{$employee->id}", [...$names, 'location_id' => Location::factory()->archived()->create()->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('location_id');
        $this->assertSame(Location::primary()->id, $employee->fresh()?->location_id);

        // Il tipo lo cambia anche il responsabile, nella sua sede
        $this->actingAs($manager)->patchJson("/api/users/{$employee->id}", [...$names, 'employment_type' => 'intern'])
            ->assertOk()
            ->assertJsonPath('data.employment_type', 'intern');
    }

    public function test_moving_another_admin_needs_the_password_and_warns_the_admins(): void
    {
        $other = User::factory()->admin()->create();
        $third = User::factory()->admin()->create();
        $payload = ['first_name' => $other->first_name, 'last_name' => $other->last_name, 'location_id' => $this->milano->id];

        $this->actingAs($this->admin)->patchJson("/api/users/{$other->id}", $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->actingAs($this->admin)->patchJson("/api/users/{$other->id}", [...$payload, 'current_password' => 'password'])->assertOk();

        foreach ([$other, $third] as $recipient) {
            Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->change === AdminChange::LocationChanged && $mail->hasTo($recipient->email));
        }

        Mail::assertNotQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($this->admin->email));
    }

    public function test_changing_the_type_of_another_admin_needs_the_password_and_warns_the_admins(): void
    {
        $other = User::factory()->admin()->create();
        $third = User::factory()->admin()->create();
        $payload = ['first_name' => $other->first_name, 'last_name' => $other->last_name, 'employment_type' => 'contractor'];

        $this->actingAs($this->admin)->patchJson("/api/users/{$other->id}", $payload)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->assertSame(EmploymentType::Employee, $other->fresh()?->employment_type);

        $this->actingAs($this->admin)->patchJson("/api/users/{$other->id}", [...$payload, 'current_password' => 'password'])
            ->assertOk()
            ->assertJsonPath('data.employment_type', 'contractor');

        foreach ([$other, $third] as $recipient) {
            Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->change === AdminChange::EmploymentTypeChanged && $mail->hasTo($recipient->email));
        }

        Mail::assertNotQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($this->admin->email));
        Mail::assertNotQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->change === AdminChange::LocationChanged);
    }

    public function test_the_admin_filters_and_sorts_by_location_and_everyone_filters_by_type(): void
    {
        User::factory()->at($this->milano)->contractor()->create(['last_name' => 'Bianchi']);
        $intern = User::factory()->intern()->create(['last_name' => 'Verdi']);

        $this->actingAs($this->admin)->getJson("/api/users?filter[location]={$this->milano->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.last_name', 'Bianchi');
        $this->actingAs($this->admin)->getJson('/api/users?sort=location')->assertOk()->assertJsonPath('data.0.location.name', 'Milano');
        $this->actingAs($this->admin)->getJson('/api/users?sort=-location')->assertOk()->assertJsonPath('data.0.location.name', 'Sede principale');
        $this->actingAs($this->admin)->getJson('/api/users?filter[employment_type]=intern')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $intern->id);

        $manager = User::factory()->manager()->create();
        $this->actingAs($manager)->getJson('/api/users?filter[employment_type]=intern')->assertOk()->assertJsonCount(1, 'data');
        $this->actingAs($manager)->getJson("/api/users?filter[location]={$this->milano->id}")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('filter.location');
        $this->actingAs($manager)->getJson('/api/users?sort=location')->assertUnprocessable()->assertJsonValidationErrors('sort');
    }

    public function test_each_row_says_who_may_move_people_manage_schedules_and_read_the_history(): void
    {
        User::factory()->create(['last_name' => 'Aaa']);
        $manager = User::factory()->manager()->create(['last_name' => 'Zzz']);

        $this->actingAs($this->admin)->getJson('/api/users')
            ->assertOk()
            ->assertJsonPath('data.0.can.change_location', true)
            ->assertJsonPath('data.0.can.manage_schedule', true)
            ->assertJsonPath('data.0.can.view_history', true);
        $this->actingAs($manager)->getJson('/api/users')
            ->assertOk()
            ->assertJsonPath('data.0.can.change_location', false)
            ->assertJsonPath('data.0.can.manage_schedule', false)
            ->assertJsonPath('data.0.can.view_history', true);
    }

    public function test_the_current_user_knows_location_type_and_whether_there_are_several_locations(): void
    {
        $user = User::factory()->contractor()->create();
        Location::query()->whereKey($this->milano->id)->update(['archived_at' => now()]);

        $this->actingAs($user)->fromFrontend()->getJson('/api/auth/user')
            ->assertOk()
            ->assertJsonPath('data.location', ['id' => Location::primary()->id, 'name' => 'Sede principale'])
            ->assertJsonPath('data.employment_type', 'contractor')
            ->assertJsonPath('data.employment_type_label', 'Collaboratore esterno')
            ->assertJsonPath('meta.multiple_locations', false);

        // Una sede archiviata non conta: riattivata, le sedi attive diventano due
        Location::query()->whereKey($this->milano->id)->update(['archived_at' => null]);
        $this->getJson('/api/auth/user')->assertOk()->assertJsonPath('meta.multiple_locations', true);
    }

    public function test_administrators_show_their_location_and_a_new_admin_can_be_invited_elsewhere(): void
    {
        $this->actingAs($this->admin)->getJson('/api/administrators')->assertOk()->assertJsonPath('data.0.location.name', 'Sede principale');

        $this->actingAs($this->admin)->postJson('/api/administrators/invitations', ['first_name' => 'Nora', 'last_name' => 'Neri', 'email' => 'nora@example.test', 'location_id' => $this->milano->id, 'employment_type' => 'contractor', 'current_password' => 'password'])
            ->assertCreated()
            ->assertJsonPath('data.location.name', 'Milano')
            ->assertJsonPath('data.employment_type', 'contractor');
    }

    /**
     * @param  array<string, mixed>  $extra
     */
    private function invite(User $actor, array $extra = []): TestResponse
    {
        return $this->actingAs($actor)->postJson('/api/users', ['first_name' => 'Sara', 'last_name' => 'Colombo', 'email' => 'sara@example.test', 'role' => 'employee', ...$extra]);
    }
}
