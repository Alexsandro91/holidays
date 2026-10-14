<?php

namespace Tests\Feature\Profile;

use App\Enums\AuthEventType;
use App\Mail\PasswordChangedMail;
use App\Models\AuthEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Cambio password dal profilo (fase 4, §2.3).
 */
class ChangePasswordTest extends TestCase
{
    use RefreshDatabase;

    private const NEW_PASSWORD = 'una-password-nuova-lunga';

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    /**
     * @param  array<string, mixed>  $overrides
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return [
            'current_password' => 'password',
            'password' => self::NEW_PASSWORD,
            'password_confirmation' => self::NEW_PASSWORD,
            ...$overrides,
        ];
    }

    private function insertSession(string $id, int $userId): void
    {
        DB::table('sessions')->insert(['id' => $id, 'user_id' => $userId, 'ip_address' => '127.0.0.1', 'user_agent' => 'test', 'payload' => '', 'last_activity' => now()->getTimestamp()]);
    }

    /**
     * @return array<string, array{0: string}>
     */
    public static function roles(): array
    {
        return ['employee' => ['employee'], 'manager' => ['manager'], 'admin' => ['admin']];
    }

    public function test_guests_get_401(): void
    {
        $this->putJson('/api/profile/password', $this->payload())->assertUnauthorized();
    }

    #[DataProvider('roles')]
    public function test_every_role_changes_its_own_password(string $role): void
    {
        $user = match ($role) {
            'manager' => User::factory()->manager()->create(),
            'admin' => User::factory()->admin()->create(),
            default => User::factory()->create(),
        };

        $this->actingAs($user)->fromFrontend()->putJson('/api/profile/password', $this->payload())->assertNoContent();

        $this->assertTrue(Hash::check(self::NEW_PASSWORD, $user->fresh()->password));
    }

    public function test_success_closes_other_sessions_keeps_the_current_one_and_clears_reset_tokens(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $this->insertSession('other-device-1', $user->id);
        $this->insertSession('other-device-2', $user->id);
        $this->insertSession('someone-else', $other->id);
        Password::broker()->createToken($user);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email]);

        $this->actingAs($user)->fromFrontend()->withSession(['x' => 1]);
        $this->putJson('/api/profile/password', $this->payload())->assertNoContent();

        $this->assertDatabaseMissing('sessions', ['id' => 'other-device-1']);
        $this->assertDatabaseMissing('sessions', ['id' => 'other-device-2']);
        $this->assertDatabaseHas('sessions', ['id' => 'someone-else']);
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => $user->email]);
        // L'utente resta collegato
        $this->getJson('/api/auth/user')->assertOk()->assertJsonPath('data.id', $user->id);
    }

    public function test_the_session_id_is_regenerated_and_the_user_stays_logged_in(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->fromFrontend()->withSession(['x' => 1]);
        $before = session()->getId();

        $this->putJson('/api/profile/password', $this->payload())->assertNoContent();

        $this->assertNotSame($before, session()->getId());
        $this->getJson('/api/auth/user')->assertOk();
    }

    public function test_the_event_is_recorded_and_the_mail_is_queued_in_the_user_language(): void
    {
        $user = User::factory()->create(['locale' => 'en']);

        $this->actingAs($user)->fromFrontend()->putJson('/api/profile/password', $this->payload())->assertNoContent();

        $event = AuthEvent::query()->where('event', AuthEventType::PasswordChanged)->sole();
        $this->assertSame($user->id, $event->user_id);
        $this->assertSame($user->id, $event->actor_id);
        Mail::assertQueued(PasswordChangedMail::class, fn (PasswordChangedMail $mail) => $mail->hasTo($user->email) && $mail->locale === 'en');
    }

    public function test_the_mail_comes_in_italian_for_italian_users(): void
    {
        $user = User::factory()->create(['locale' => 'it']);

        $this->actingAs($user)->fromFrontend()->putJson('/api/profile/password', $this->payload())->assertNoContent();

        Mail::assertQueued(PasswordChangedMail::class, fn (PasswordChangedMail $mail) => $mail->locale === 'it');
    }

    public function test_the_mail_text_tells_what_to_do_if_it_was_not_you(): void
    {
        app()->setLocale('it');
        $mail = new PasswordChangedMail('Mozilla/5.0', now());

        $mail->assertSeeInText('Se non sei stato tu');
    }

    public function test_a_wrong_current_password_is_422_and_logs_the_failure(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->fromFrontend()->putJson('/api/profile/password', $this->payload(['current_password' => 'sbagliata']))
            ->assertUnprocessable()->assertJsonValidationErrors(['current_password']);

        $this->assertTrue(Hash::check('password', $user->fresh()->password));
        $this->assertSame(1, AuthEvent::query()->where('event', AuthEventType::PasswordChangeFailed)->where('user_id', $user->id)->count());
        $this->assertSame(0, AuthEvent::query()->where('event', AuthEventType::AdminPasswordFailed)->count());
        Mail::assertNothingQueued();
    }

    public function test_five_failures_lock_the_action_with_429_and_retry_after(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user)->fromFrontend();

        for ($i = 0; $i < 5; $i++) {
            $this->putJson('/api/profile/password', $this->payload(['current_password' => 'sbagliata']))->assertUnprocessable();
        }

        // Anche con la password giusta resta bloccato
        $this->putJson('/api/profile/password', $this->payload())
            ->assertTooManyRequests()->assertHeader('Retry-After');

        $this->assertTrue(Hash::check('password', $user->fresh()->password));
        $this->assertSame(1, AuthEvent::query()->where('event', AuthEventType::PasswordChangeLocked)->count());
    }

    public function test_the_counter_is_shared_with_the_admin_actions(): void
    {
        $user = User::factory()->admin()->create();
        RateLimiter::hit('admin-password:'.$user->id, 900);
        RateLimiter::hit('admin-password:'.$user->id, 900);
        RateLimiter::hit('admin-password:'.$user->id, 900);
        RateLimiter::hit('admin-password:'.$user->id, 900);
        $this->actingAs($user)->fromFrontend();

        $this->putJson('/api/profile/password', $this->payload(['current_password' => 'sbagliata']))->assertUnprocessable();
        $this->putJson('/api/profile/password', $this->payload())->assertTooManyRequests();
    }

    public function test_a_correct_password_does_not_consume_attempts(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->fromFrontend()->putJson('/api/profile/password', $this->payload())->assertNoContent();

        $this->assertSame(0, RateLimiter::attempts('admin-password:'.$user->id));
    }

    public function test_the_new_password_must_differ_from_the_current_one(): void
    {
        $this->actingAs(User::factory()->create(['password' => 'vecchia-password-lunga']))->fromFrontend()
            ->putJson('/api/profile/password', $this->payload(['current_password' => 'vecchia-password-lunga', 'password' => 'vecchia-password-lunga', 'password_confirmation' => 'vecchia-password-lunga']))
            ->assertUnprocessable()->assertJsonValidationErrors(['password']);
    }

    public function test_the_same_password_message_is_in_the_user_language(): void
    {
        $user = User::factory()->create(['locale' => 'en', 'password' => 'vecchia-password-lunga']);

        $this->actingAs($user)->fromFrontend()
            ->putJson('/api/profile/password', $this->payload(['current_password' => 'vecchia-password-lunga', 'password' => 'vecchia-password-lunga', 'password_confirmation' => 'vecchia-password-lunga']))
            ->assertJsonPath('errors.password.0', 'The new password must be different from the current one.');
    }

    /**
     * @return array<string, array{0: array<string, mixed>, 1: string}>
     */
    public static function invalidPasswords(): array
    {
        return [
            'too short' => [['password' => 'corta', 'password_confirmation' => 'corta'], 'password'],
            'confirmation differs' => [['password_confirmation' => 'altra-password-lunga'], 'password'],
            'missing confirmation' => [['password_confirmation' => null], 'password'],
            'missing current' => [['current_password' => null], 'current_password'],
            'missing new' => [['password' => null, 'password_confirmation' => null], 'password'],
        ];
    }

    /**
     * @param  array<string, mixed>  $overrides
     */
    #[DataProvider('invalidPasswords')]
    public function test_validation_errors(array $overrides, string $field): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->fromFrontend()->putJson('/api/profile/password', $this->payload($overrides))
            ->assertUnprocessable()->assertJsonValidationErrors([$field]);

        $this->assertTrue(Hash::check('password', $user->fresh()->password));
        Mail::assertNothingQueued();
    }
}
