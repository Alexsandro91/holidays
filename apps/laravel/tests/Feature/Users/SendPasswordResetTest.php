<?php

namespace Tests\Feature\Users;

use App\Enums\AdminChange;
use App\Enums\AuthEventType;
use App\Mail\AdminChangeMail;
use App\Mail\ResetPasswordMail;
use App\Models\AuthEvent;
use App\Models\User;
use App\Policies\UserPolicy;
use App\Services\PasswordResetService;
use App\Services\UserManagementService;
use App\Support\EmailKey;
use Illuminate\Auth\Passwords\PasswordBroker;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use LogicException;
use Mockery;
use PHPUnit\Framework\Attributes\DataProvider;
use RuntimeException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Tests\TestCase;

/**
 * Reset della password avviato da un admin o da un responsabile (fase 4, §6): solo il link, all'email della persona.
 */
class SendPasswordResetTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    private function uri(User $target): string
    {
        return "/api/users/{$target->id}/password-reset";
    }

    /**
     * @return array<string, array{string, string, bool}>
     */
    public static function matrix(): array
    {
        return [
            'employee on employee' => ['employee', 'employee', false],
            'manager on employee' => ['manager', 'employee', true],
            'manager on manager' => ['manager', 'manager', true],
            'manager on admin' => ['manager', 'admin', false],
            'admin on employee' => ['admin', 'employee', true],
            'admin on admin' => ['admin', 'admin', true],
        ];
    }

    #[DataProvider('matrix')]
    public function test_permission_matrix(string $actorRole, string $targetRole, bool $allowed): void
    {
        $actor = User::factory()->create(['role' => $actorRole]);
        $target = User::factory()->create(['role' => $targetRole]);

        $this->assertSame($allowed, (new UserPolicy)->sendPasswordReset($actor, $target));
        $this->assertFalse((new UserPolicy)->sendPasswordReset($actor, $actor));

        $response = $this->actingAs($actor)->postJson($this->uri($target), $targetRole === 'admin' ? ['current_password' => 'password'] : []);
        $allowed ? $response->assertAccepted() : $response->assertForbidden();
    }

    public function test_guests_get_401_and_nobody_resets_themselves(): void
    {
        $user = User::factory()->admin()->create();

        $this->postJson($this->uri($user))->assertUnauthorized();
        $this->actingAs($user)->postJson($this->uri($user), ['current_password' => 'password'])->assertForbidden();
    }

    public function test_the_row_flag_follows_the_policy(): void
    {
        $manager = User::factory()->manager()->create();
        $employee = User::factory()->create();
        $admin = User::factory()->admin()->create();

        $this->actingAs($manager)->patchJson("/api/users/{$employee->id}", ['first_name' => 'Sara', 'last_name' => 'Rossi'])
            ->assertJsonPath('data.can.send_password_reset', true);
        $this->actingAs($admin)->patchJson("/api/users/{$employee->id}", ['first_name' => 'Sara', 'last_name' => 'Rossi'])
            ->assertJsonPath('data.can.send_password_reset', true);
    }

    public function test_the_link_goes_only_to_the_person_with_the_extra_line_and_without_the_actor_name(): void
    {
        $manager = User::factory()->manager()->create(['first_name' => 'Marta', 'last_name' => 'Responsabile']);
        $employee = User::factory()->create(['locale' => 'en']);

        $this->actingAs($manager)->postJson($this->uri($employee))->assertAccepted()->assertNoContent(202);

        Mail::assertQueuedCount(1);
        Mail::assertQueued(ResetPasswordMail::class, function (ResetPasswordMail $mail) use ($employee): bool {
            $mail->assertSeeInText('requested by an administrator or your manager');
            $mail->assertDontSeeInText('Marta');

            return $mail->hasTo($employee->email) && $mail->locale === 'en' && $mail->email === $employee->email;
        });
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $employee->email]);
    }

    public function test_the_public_link_does_not_carry_the_extra_line(): void
    {
        app()->setLocale('it');

        (new ResetPasswordMail('a@example.test', 'tok'))->assertDontSeeInText('amministratore o dal tuo responsabile');
        (new ResetPasswordMail('a@example.test', 'tok', true))->assertSeeInText('amministratore o dal tuo responsabile');
    }

    public function test_the_event_has_the_recipient_and_the_actor(): void
    {
        $manager = User::factory()->manager()->create();
        $employee = User::factory()->create();

        $this->actingAs($manager)->postJson($this->uri($employee))->assertAccepted();

        $event = AuthEvent::query()->where('event', AuthEventType::PasswordResetSent)->sole();
        $this->assertSame($employee->id, $event->user_id);
        $this->assertSame($manager->id, $event->actor_id);
        $this->assertSame('password_reset_sent', $event->event->value);
    }

    public function test_the_password_stays_valid_and_sessions_stay_open(): void
    {
        $manager = User::factory()->manager()->create();
        $employee = User::factory()->create();
        DB::table('sessions')->insert(['id' => 's1', 'user_id' => $employee->id, 'ip_address' => '127.0.0.1', 'user_agent' => 't', 'payload' => '', 'last_activity' => now()->getTimestamp()]);

        $this->actingAs($manager)->postJson($this->uri($employee))->assertAccepted();

        $this->assertTrue(Hash::check('password', $employee->fresh()->password));
        $this->assertDatabaseHas('sessions', ['id' => 's1']);
        $this->assertSame($employee->status, $employee->fresh()->status);
    }

    public function test_only_active_users_get_a_link(): void
    {
        $manager = User::factory()->manager()->create();

        foreach ([User::factory()->invited()->create(), User::factory()->disabled()->create()] as $target) {
            $this->actingAs($manager)->postJson($this->uri($target))
                ->assertConflict()
                ->assertJsonPath('message', __('users.not_active'));
        }

        Mail::assertNothingQueued();
        $this->assertSame(0, AuthEvent::query()->where('event', AuthEventType::PasswordResetSent)->count());
    }

    public function test_an_admin_recipient_needs_the_password_and_the_other_admins_are_told_never_the_actor(): void
    {
        $actor = User::factory()->admin()->create();
        $target = User::factory()->admin()->create();
        $third = User::factory()->admin()->create();
        User::factory()->admin()->disabled()->create();

        $this->actingAs($actor)->postJson($this->uri($target))->assertUnprocessable()->assertJsonValidationErrors(['current_password']);
        $this->actingAs($actor)->postJson($this->uri($target), ['current_password' => 'sbagliata'])->assertUnprocessable();
        Mail::assertNothingQueued();

        $this->actingAs($actor)->postJson($this->uri($target), ['current_password' => 'password'])->assertAccepted();

        Mail::assertQueued(ResetPasswordMail::class, fn (ResetPasswordMail $mail): bool => $mail->hasTo($target->email));
        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->change === AdminChange::PasswordResetSent && $mail->hasTo($third->email));
        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($target->email));
        Mail::assertNotQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($actor->email));
        Mail::assertQueuedCount(3);
    }

    public function test_a_non_admin_recipient_does_not_notify_the_admins_nor_ask_the_password(): void
    {
        User::factory()->admin()->create();

        $this->actingAs(User::factory()->admin()->create())->postJson($this->uri(User::factory()->create()))->assertAccepted();

        Mail::assertNotQueued(AdminChangeMail::class);
    }

    public function test_wrong_admin_passwords_count_toward_the_shared_lockout(): void
    {
        $actor = User::factory()->admin()->create();
        $target = User::factory()->admin()->create();

        for ($i = 0; $i < 5; $i++) {
            $this->actingAs($actor)->postJson($this->uri($target), ['current_password' => 'sbagliata'])->assertUnprocessable();
        }
        $this->actingAs($actor)->postJson($this->uri($target), ['current_password' => 'password'])->assertTooManyRequests();

        $this->assertSame(5, AuthEvent::query()->where('event', AuthEventType::AdminPasswordFailed)->count());
    }

    public function test_a_recipient_promoted_in_the_meantime_is_a_409_and_nothing_is_sent(): void
    {
        $actor = User::factory()->admin()->create();
        $target = User::factory()->create();
        $stale = User::query()->findOrFail($target->id);
        User::query()->whereKey($target->id)->update(['role' => 'admin']);

        // La request ha letto un dipendente (senza password); sotto blocco il destinatario è già admin
        $this->expectException(ConflictHttpException::class);

        try {
            app(UserManagementService::class)->sendPasswordReset($stale, $actor, request(), expectAdmin: false);
        } finally {
            Mail::assertNothingQueued();
            $this->assertDatabaseMissing('password_reset_tokens', ['email' => $target->email]);
        }
    }

    public function test_the_per_minute_throttle_is_shared_with_the_public_link(): void
    {
        $manager = User::factory()->manager()->create();
        $employee = User::factory()->create();

        $this->postJson('/api/auth/forgot-password', ['email' => $employee->email])->assertAccepted();
        Mail::assertQueuedCount(1);

        $this->actingAs($manager)->postJson($this->uri($employee))
            ->assertTooManyRequests()
            ->assertHeader('Retry-After');
        Mail::assertQueuedCount(1);
    }

    public function test_public_links_fill_the_hourly_cap_for_the_staff(): void
    {
        $manager = User::factory()->manager()->create();
        $employee = User::factory()->create();

        // Cinque richieste pubbliche da IP diversi, distanziate oltre i 60 secondi del broker
        for ($i = 1; $i <= 5; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => "10.0.0.{$i}"])->postJson('/api/auth/forgot-password', ['email' => strtoupper($employee->email)])->assertAccepted();
            $this->travel(61)->seconds();
        }
        Mail::assertQueuedCount(5);

        $this->actingAs($manager)->postJson($this->uri($employee))
            ->assertTooManyRequests()
            ->assertHeader('Retry-After');

        Mail::assertQueuedCount(5);
        $this->assertSame(0, AuthEvent::query()->where('event', AuthEventType::PasswordResetSent)->count());
    }

    public function test_staff_links_fill_the_hourly_cap_for_the_public_flow(): void
    {
        $manager = User::factory()->manager()->create();
        $employee = User::factory()->create();

        for ($i = 0; $i < 5; $i++) {
            $this->actingAs($manager)->postJson($this->uri($employee))->assertAccepted();
            $this->travel(61)->seconds();
        }
        Mail::assertQueuedCount(5);

        // La richiesta pubblica è di un ospite: risponde come sempre ma non invia nulla
        $this->app['auth']->forgetGuards();
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.99'])->postJson('/api/auth/forgot-password', ['email' => $employee->email])->assertAccepted();

        Mail::assertQueuedCount(5);
    }

    public function test_a_failed_transaction_leaves_no_hit_and_no_email(): void
    {
        $actor = User::factory()->manager()->create();
        $employee = User::factory()->create();
        AuthEvent::creating(fn () => throw new RuntimeException('boom'));

        try {
            app(UserManagementService::class)->sendPasswordReset($employee, $actor, request(), expectAdmin: false);
            $this->fail('The transaction should have failed.');
        } catch (RuntimeException) {
            // atteso
        }

        $this->assertSame(0, RateLimiter::attempts('reset-link:'.EmailKey::from($employee->email)));
        Mail::assertNothingQueued();
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $employee->email]);
    }

    public function test_an_unexpected_broker_status_is_an_error_without_hit(): void
    {
        $employee = User::factory()->create();
        $broker = Mockery::mock(PasswordBroker::class);
        $broker->shouldReceive('sendResetLink')->andReturn(PasswordBroker::INVALID_USER);
        Password::shouldReceive('broker')->andReturn($broker);

        try {
            app(PasswordResetService::class)->sendLinkFor($employee, true);
            $this->fail('A LogicException was expected.');
        } catch (LogicException) {
            // atteso
        }

        $this->assertSame(0, RateLimiter::attempts('reset-link:'.EmailKey::from($employee->email)));
        Mail::assertNothingQueued();
    }

    public function test_a_staff_link_counts_toward_the_hourly_cap(): void
    {
        $employee = User::factory()->create();

        $this->actingAs(User::factory()->manager()->create())->postJson($this->uri($employee))->assertAccepted();

        $this->assertSame(1, RateLimiter::attempts('reset-link:'.EmailKey::from($employee->email)));
    }
}
