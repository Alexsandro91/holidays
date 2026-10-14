<?php

namespace Tests\Feature\Users;

use App\Enums\AdminChange;
use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\AdminChangeMail;
use App\Mail\InvitationMail;
use App\Mail\LoginCodeMail;
use App\Models\User;
use App\Services\InvitationService;
use App\Services\UserManagementService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Tests\TestCase;

/**
 * Invito di un nuovo admin dalla sezione Amministratori (spec del 14/10, §4).
 */
class InviteAdminTest extends TestCase
{
    use RefreshDatabase;

    private const URI = '/api/administrators/invitations';

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->admin = User::factory()->admin()->create(['first_name' => 'Anna', 'last_name' => 'Admin']);
    }

    /**
     * @param  array<string, string>  $overrides
     * @return array<string, string>
     */
    private function payload(array $overrides = []): array
    {
        return [...['first_name' => 'Nora', 'last_name' => 'Neri', 'email' => 'nora@example.test', 'current_password' => 'password'], ...$overrides];
    }

    private function invitationToken(string $email): string
    {
        $token = '';
        Mail::assertQueued(InvitationMail::class, function (InvitationMail $mail) use ($email, &$token): bool {
            if ($mail->hasTo($email)) {
                $token = $mail->token;
            }

            return true;
        });

        return $token;
    }

    public function test_an_admin_invites_a_new_admin(): void
    {
        $this->actingAs($this->admin)->postJson(self::URI, $this->payload(['email' => '  Nora@Example.TEST ', 'first_name' => ' Nora ', 'last_name' => ' Neri ']))
            ->assertCreated()
            ->assertJsonPath('data.first_name', 'Nora')
            ->assertJsonPath('data.last_name', 'Neri')
            ->assertJsonPath('data.name', 'Nora Neri')
            ->assertJsonPath('data.email', 'nora@example.test')
            ->assertJsonPath('data.role', 'admin')
            ->assertJsonPath('data.status', 'invited')
            ->assertJsonPath('data.can.resend_invitation', true);

        $invited = User::query()->where('email', 'nora@example.test')->firstOrFail();
        $this->assertSame(Role::Admin, $invited->role);
        $this->assertSame(UserStatus::Invited, $invited->status);
        $this->assertNull($invited->password);
        $this->assertNotNull($invited->invitation);
        $this->assertEqualsWithDelta(now()->addHours(InvitationService::TTL_HOURS)->getTimestamp(), $invited->invitation->expires_at->getTimestamp(), 1);
        Mail::assertQueued(InvitationMail::class, fn (InvitationMail $mail): bool => $mail->hasTo('nora@example.test') && $mail->inviterName === 'Anna Admin');
    }

    public function test_the_invitation_is_audited_and_the_other_active_admins_are_told(): void
    {
        $otherAdmin = User::factory()->admin()->create();
        $disabledAdmin = User::factory()->admin()->disabled()->create();
        $manager = User::factory()->manager()->create();

        $this->actingAs($this->admin)->postJson(self::URI, $this->payload())->assertCreated();

        $invited = User::query()->where('email', 'nora@example.test')->firstOrFail();
        $this->assertDatabaseHas('auth_events', ['user_id' => $invited->id, 'actor_id' => $this->admin->id, 'event' => AuthEventType::AdminInvited->value]);
        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($otherAdmin->email)
            && $mail->change === AdminChange::Invited
            && $mail->actorName === 'Anna Admin'
            && $mail->targetName === 'Nora Neri');
        Mail::assertQueued(AdminChangeMail::class, 1);
        foreach ([$this->admin, $disabledAdmin, $manager, $invited] as $notTold) {
            Mail::assertNotQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($notTold->email));
        }
    }

    public function test_a_wrong_password_creates_nothing(): void
    {
        $this->actingAs($this->admin)->postJson(self::URI, $this->payload(['current_password' => 'sbagliata']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->actingAs($this->admin)->postJson(self::URI, $this->payload(['current_password' => '']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');

        $this->assertDatabaseMissing('users', ['email' => 'nora@example.test']);
        Mail::assertNothingQueued();
    }

    public function test_five_wrong_passwords_lock_the_invitation_and_the_other_admin_actions(): void
    {
        $employee = User::factory()->create();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->actingAs($this->admin)->postJson(self::URI, $this->payload(['current_password' => 'sbagliata']))->assertUnprocessable();
        }

        $this->actingAs($this->admin)->postJson(self::URI, $this->payload())
            ->assertTooManyRequests()
            ->assertHeader('Retry-After');
        $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => $employee->id, 'current_password' => 'password'])
            ->assertTooManyRequests();
        $this->assertDatabaseMissing('users', ['email' => 'nora@example.test']);
    }

    public function test_successful_invitations_do_not_use_up_password_attempts(): void
    {
        for ($attempt = 0; $attempt < 6; $attempt++) {
            $this->actingAs($this->admin)->postJson(self::URI, $this->payload(['email' => "nora{$attempt}@example.test"]))->assertCreated();
        }
    }

    public function test_an_email_already_in_use_is_rejected(): void
    {
        User::factory()->create(['email' => 'nora@example.test']);

        $this->actingAs($this->admin)->postJson(self::URI, $this->payload(['email' => ' NORA@example.test']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
        $this->assertSame(1, User::query()->where('email', 'nora@example.test')->count());
        Mail::assertNothingQueued();
    }

    public function test_name_and_email_follow_the_rules_of_the_normal_invitation(): void
    {
        $this->actingAs($this->admin)->postJson(self::URI, ['current_password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['first_name', 'last_name', 'email']);
        $this->actingAs($this->admin)->withHeader('Accept-Language', 'it')
            ->postJson(self::URI, $this->payload(['first_name' => '[Verifica](https://phish.example)', 'last_name' => 'Neri <b>', 'email' => 'non-una-email']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors([
                'first_name' => 'Il nome non può contenere parentesi quadre, i segni < > o caratteri di controllo.',
                'last_name' => 'Il cognome non può contenere parentesi quadre, i segni < > o caratteri di controllo.',
                'email',
            ]);
        $this->assertDatabaseCount('users', 1);
    }

    public function test_managers_and_employees_get_403_without_touching_the_password_counter(): void
    {
        foreach ([User::factory()->manager()->create(), User::factory()->create()] as $actor) {
            for ($attempt = 0; $attempt < 6; $attempt++) {
                $this->actingAs($actor)->postJson(self::URI, $this->payload(['current_password' => 'sbagliata']))->assertForbidden();
            }
        }

        $this->assertDatabaseMissing('users', ['email' => 'nora@example.test']);
        Mail::assertNothingQueued();
    }

    public function test_guests_get_401(): void
    {
        $this->postJson(self::URI, $this->payload())->assertUnauthorized();
    }

    public function test_the_activation_makes_an_active_admin_after_the_code_step(): void
    {
        $this->actingAs($this->admin)->postJson(self::URI, $this->payload())->assertCreated();
        $token = $this->invitationToken('nora@example.test');
        $this->app['auth']->forgetGuards();

        $this->postJson("/api/invitations/{$token}/accept", [
            'password' => 'una-frase-lunga-e-nuova',
            'password_confirmation' => 'una-frase-lunga-e-nuova',
            'privacy_acknowledged' => true,
        ])->assertOk()->assertJsonPath('two_factor', true);
        $this->assertGuest();

        $code = '';
        Mail::assertQueued(LoginCodeMail::class, function (LoginCodeMail $mail) use (&$code): bool {
            $code = $mail->code;

            return true;
        });
        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertOk()->assertJsonPath('data.email', 'nora@example.test');

        $invited = User::query()->where('email', 'nora@example.test')->firstOrFail();
        $this->assertSame(Role::Admin, $invited->role);
        $this->assertSame(UserStatus::Active, $invited->status);
        $this->getJson('/api/administrators')->assertOk();
    }

    public function test_the_administrators_page_lists_the_pending_admin_invitation(): void
    {
        $this->actingAs($this->admin)->postJson(self::URI, $this->payload())->assertCreated();

        $this->actingAs($this->admin)->getJson('/api/administrators')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.1.email', 'nora@example.test')
            ->assertJsonPath('data.1.status', 'invited')
            ->assertJsonPath('data.1.can.cancel_invitation', true);
    }

    public function test_only_an_admin_resends_or_cancels_an_admin_invitation(): void
    {
        $manager = User::factory()->manager()->create();
        $this->actingAs($this->admin)->postJson(self::URI, $this->payload())->assertCreated();
        $invited = User::query()->where('email', 'nora@example.test')->firstOrFail();

        $this->actingAs($manager)->postJson("/api/users/{$invited->id}/invitation")->assertForbidden();
        $this->actingAs($manager)->deleteJson("/api/users/{$invited->id}/invitation")->assertForbidden();

        $this->travel(61)->seconds();
        $this->actingAs($this->admin)->postJson("/api/users/{$invited->id}/invitation")->assertAccepted();
        Mail::assertQueued(InvitationMail::class, 2);
        $this->actingAs($this->admin)->deleteJson("/api/users/{$invited->id}/invitation")->assertNoContent();
        $this->assertModelMissing($invited);
    }

    public function test_the_normal_invitation_still_refuses_the_admin_role(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', ['first_name' => 'Nora', 'last_name' => 'Neri', 'email' => 'nora@example.test', 'role' => 'admin'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');

        try {
            app(InvitationService::class)->invite('Nora', 'Neri', 'nora@example.test', Role::Admin, $this->admin, Request::create('/'));
            $this->fail('Un admin si invita solo dalla sezione Amministratori');
        } catch (InvalidArgumentException) {
            $this->assertDatabaseMissing('users', ['email' => 'nora@example.test']);
        }
    }

    public function test_an_actor_no_longer_admin_cannot_invite_admins(): void
    {
        $stale = User::factory()->admin()->create();
        User::query()->whereKey($stale->id)->update(['role' => 'manager']);

        try {
            app(UserManagementService::class)->inviteAdmin('Nora', 'Neri', 'nora@example.test', $stale, Request::create('/'));
            $this->fail('Expected AuthorizationException');
        } catch (AuthorizationException) {
            $this->assertDatabaseMissing('users', ['email' => 'nora@example.test']);
            Mail::assertNothingQueued();
        }
    }

    public function test_two_parallel_invitations_with_the_same_email_give_422_not_500(): void
    {
        // La seconda richiesta ha superato la validazione prima che la prima salvasse l'utente
        User::factory()->create(['email' => 'nora@example.test']);
        $calls = [
            'invito admin' => fn () => app(UserManagementService::class)->inviteAdmin('Nora', 'Neri', 'nora@example.test', $this->admin, Request::create('/')),
            'invito normale' => fn () => app(InvitationService::class)->invite('Nora', 'Neri', 'nora@example.test', Role::Employee, $this->admin, Request::create('/')),
        ];

        foreach ($calls as $label => $call) {
            try {
                $call();
                $this->fail("{$label}: expected ValidationException");
            } catch (ValidationException $exception) {
                $this->assertArrayHasKey('email', $exception->errors(), $label);
            }
        }

        $this->assertSame(1, User::query()->where('email', 'nora@example.test')->count());
        $this->assertDatabaseCount('auth_events', 0);
        $this->assertDatabaseCount('invitations', 0);
        Mail::assertNothingQueued();
    }
}
