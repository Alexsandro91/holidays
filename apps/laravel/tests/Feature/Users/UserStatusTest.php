<?php

namespace Tests\Feature\Users;

use App\Enums\AuthEventType;
use App\Mail\AdminChangeMail;
use App\Models\Invitation;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Services\UserManagementService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class UserStatusTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        // La factory usa la password "password"
        $this->admin = User::factory()->admin()->create();
    }

    public function test_disabling_closes_every_session_code_and_reset_link(): void
    {
        $employee = User::factory()->create();
        DB::table('sessions')->insert(['id' => 's1', 'user_id' => $employee->id, 'ip_address' => '127.0.0.1', 'user_agent' => 't', 'payload' => '', 'last_activity' => now()->getTimestamp()]);
        LoginChallenge::query()->create(['user_id' => $employee->id, 'code_hash' => str_repeat('a', 64), 'expires_at' => now()->addMinutes(10), 'attempts' => 0, 'resend_count' => 0, 'last_sent_at' => now()]);
        DB::table('password_reset_tokens')->insert(['email' => $employee->email, 'token' => 'hash', 'created_at' => now()]);

        $this->actingAs($this->admin)->postJson("/api/users/{$employee->id}/disable")
            ->assertOk()
            ->assertJsonPath('data.status', 'disabled');

        $this->assertDatabaseMissing('sessions', ['user_id' => $employee->id]);
        $this->assertDatabaseMissing('login_challenges', ['user_id' => $employee->id]);
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $employee->email]);
        $this->assertDatabaseHas('auth_events', ['user_id' => $employee->id, 'actor_id' => $this->admin->id, 'event' => AuthEventType::UserDisabled->value]);
        // Non è un admin: nessuna email agli admin
        Mail::assertNotQueued(AdminChangeMail::class);
    }

    public function test_a_disabled_user_loses_access_on_the_next_request(): void
    {
        $employee = User::factory()->create();
        $this->actingAs($this->admin)->postJson("/api/users/{$employee->id}/disable")->assertOk();

        $this->actingAs($employee->fresh() ?? $employee)->getJson('/api/auth/user')->assertUnauthorized();
    }

    public function test_admins_cannot_disable_themselves_and_state_must_fit(): void
    {
        $this->actingAs($this->admin)->postJson("/api/users/{$this->admin->id}/disable")->assertForbidden();

        $disabled = User::factory()->disabled()->create();
        $this->actingAs($this->admin)->postJson("/api/users/{$disabled->id}/disable")->assertConflict();
        $invited = Invitation::factory()->create()->user;
        $this->assertNotNull($invited);
        $this->actingAs($this->admin)->postJson("/api/users/{$invited->id}/disable")->assertConflict();
        $active = User::factory()->create();
        $this->actingAs($this->admin)->postJson("/api/users/{$active->id}/enable")->assertConflict();
    }

    public function test_enabling_a_disabled_employee(): void
    {
        $disabled = User::factory()->disabled()->create();

        $this->actingAs($this->admin)->postJson("/api/users/{$disabled->id}/enable")
            ->assertOk()
            ->assertJsonPath('data.status', 'active');
        $this->assertDatabaseHas('auth_events', ['user_id' => $disabled->id, 'event' => AuthEventType::UserEnabled->value]);
    }

    public function test_disabling_an_admin_needs_the_password_and_warns_every_admin(): void
    {
        $otherAdmin = User::factory()->admin()->create();
        $thirdAdmin = User::factory()->admin()->create();

        $this->actingAs($this->admin)->postJson("/api/users/{$otherAdmin->id}/disable")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->actingAs($this->admin)->postJson("/api/users/{$otherAdmin->id}/disable", ['current_password' => 'sbagliata'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');

        $this->actingAs($this->admin)->postJson("/api/users/{$otherAdmin->id}/disable", ['current_password' => 'password'])->assertOk();

        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($otherAdmin->email));
        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($thirdAdmin->email));
        // Chi agisce non riceve l'avviso della propria azione
        Mail::assertNotQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($this->admin->email));
    }

    public function test_enabling_an_admin_needs_the_password(): void
    {
        $disabledAdmin = User::factory()->admin()->disabled()->create();

        $this->actingAs($this->admin)->postJson("/api/users/{$disabledAdmin->id}/enable")
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->actingAs($this->admin)->postJson("/api/users/{$disabledAdmin->id}/enable", ['current_password' => 'password'])->assertOk();
        Mail::assertQueued(AdminChangeMail::class);
    }

    public function test_five_wrong_passwords_lock_the_admin_actions_for_fifteen_minutes(): void
    {
        $otherAdmin = User::factory()->admin()->create();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->actingAs($this->admin)->postJson("/api/users/{$otherAdmin->id}/disable", ['current_password' => 'sbagliata'])->assertUnprocessable();
        }

        $this->actingAs($this->admin)->postJson("/api/users/{$otherAdmin->id}/disable", ['current_password' => 'password'])
            ->assertTooManyRequests()
            ->assertHeader('Retry-After');

        $this->travel(16)->minutes();
        $this->actingAs($this->admin)->postJson("/api/users/{$otherAdmin->id}/disable", ['current_password' => 'password'])->assertOk();
    }

    public function test_the_actor_who_lost_admin_rights_cannot_leave_zero_admins(): void
    {
        // Simula due revoche incrociate: l'attore è già stato declassato da un'altra richiesta
        $staleActor = User::factory()->admin()->create();
        User::query()->whereKey($staleActor->id)->update(['role' => 'employee']);

        $this->expectException(AuthorizationException::class);
        app(UserManagementService::class)->disable($this->admin, $staleActor, request());
    }
}
