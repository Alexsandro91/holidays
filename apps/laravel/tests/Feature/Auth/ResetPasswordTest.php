<?php

namespace Tests\Feature\Auth;

use App\Enums\AuthEventType;
use App\Enums\UserStatus;
use App\Mail\LoginCodeMail;
use App\Mail\PasswordChangedMail;
use App\Mail\ResetPasswordMail;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Tests\Concerns\CompletesLogin;
use Tests\Fakes\FailingMailFake;
use Tests\TestCase;

class ResetPasswordTest extends TestCase
{
    use CompletesLogin, RefreshDatabase;

    private const NEW_PASSWORD = 'una-frase-lunga-e-nuova';

    private const INVALID_LINK = 'Il link non è valido o è scaduto. Chiedine uno nuovo.';

    private const DONE = ['two_factor' => true, 'message' => 'Password aggiornata. Per entrare inserisci il codice che ti abbiamo inviato via email.'];

    protected function setUp(): void
    {
        parent::setUp();

        // Il client di test invia 'en-us' di default: i messaggi attesi sono in italiano
        $this->withHeader('Accept-Language', 'it');
    }

    /**
     * Chiede il link come farebbe l'utente e restituisce il token arrivato nell'email.
     */
    private function requestToken(User $user): string
    {
        Mail::fake();
        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertAccepted();

        $token = '';
        Mail::assertQueued(ResetPasswordMail::class, function (ResetPasswordMail $mail) use (&$token): bool {
            $token = $mail->token;

            return true;
        });

        return $token;
    }

    /**
     * @return array<string, string>
     */
    private function payload(User $user, string $token, string $password = self::NEW_PASSWORD, ?string $confirmation = null): array
    {
        return ['email' => $user->email, 'token' => $token, 'password' => $password, 'password_confirmation' => $confirmation ?? $password];
    }

    public function test_a_valid_link_sets_the_new_password(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))
            ->assertOk()
            ->assertExactJson(self::DONE);

        $this->assertTrue(Hash::check(self::NEW_PASSWORD, (string) $user->fresh()?->password));
        $this->assertDatabaseCount('password_reset_tokens', 0);
        $this->assertDatabaseHas('auth_events', ['user_id' => $user->id, 'event' => AuthEventType::PasswordReset->value]);
        Mail::assertQueued(PasswordChangedMail::class, fn (PasswordChangedMail $mail): bool => $mail->hasTo($user->email));
        // Il reset non apre la sessione: parte il passo del codice, come dopo la password
        $this->assertGuest();
        $challenge = LoginChallenge::query()->sole();
        $this->assertSame($user->id, $challenge->user_id);
        $this->assertSame($challenge->id, session(AuthSession::CHALLENGE_ID));
        Mail::assertQueued(LoginCodeMail::class, 1);
        Mail::assertQueued(LoginCodeMail::class, fn (LoginCodeMail $mail): bool => $mail->hasTo($user->email));
    }

    public function test_the_emailed_code_completes_the_sign_in(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);
        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))->assertOk();

        $this->postJson('/api/auth/two-factor', ['code' => $this->lastLoginCode()])
            ->assertOk()
            ->assertJsonPath('data.email', $user->email);

        $this->assertAuthenticatedAs($user);
    }

    public function test_without_the_code_the_user_stays_a_guest(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);
        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))->assertOk();

        $this->getJson('/api/auth/user')->assertUnauthorized();
        $this->assertGuest();
    }

    public function test_a_different_confirmation_is_rejected_and_the_link_stays_valid(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token, self::NEW_PASSWORD, 'una-frase-lunga-e-diversa'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');
        $this->postJson('/api/auth/reset-password', [...$this->payload($user, $token), 'password_confirmation' => null])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');

        Mail::assertNotQueued(LoginCodeMail::class);
        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))->assertOk();
    }

    public function test_a_failing_confirmation_mail_does_not_leave_the_link_usable(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);
        Exceptions::fake();
        FailingMailFake::install(PasswordChangedMail::class);
        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))
            ->assertOk()
            ->assertExactJson(self::DONE);

        // La password è cambiata, il link non vale più e l'evento è registrato: l'errore della coda è solo segnalato
        $this->assertTrue(Hash::check(self::NEW_PASSWORD, (string) $user->fresh()?->password));
        $this->assertDatabaseCount('password_reset_tokens', 0);
        $this->assertDatabaseHas('auth_events', ['user_id' => $user->id, 'event' => AuthEventType::PasswordReset->value]);
        Exceptions::assertReported(RuntimeException::class);
        Mail::assertQueued(LoginCodeMail::class, fn (LoginCodeMail $mail): bool => $mail->hasTo($user->email));
        $this->postJson('/api/auth/reset-password', $this->payload($user, $token, 'un-altra-frase-ancora'))
            ->assertUnprocessable()
            ->assertJsonPath('errors.token.0', self::INVALID_LINK);
    }

    public function test_the_next_login_still_asks_for_the_code(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);
        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))->assertOk();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => self::NEW_PASSWORD])
            ->assertOk()
            ->assertExactJson(['two_factor' => true]);

        $this->assertGuest();
        Mail::assertQueued(LoginCodeMail::class);
    }

    public function test_all_sessions_and_pending_codes_of_the_user_are_closed(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        foreach ([$user, $other] as $index => $owner) {
            DB::table('sessions')->insert([
                'id' => 'session-'.$index,
                'user_id' => $owner->id,
                'ip_address' => '127.0.0.1',
                'user_agent' => 'test',
                'payload' => '',
                'last_activity' => now()->getTimestamp(),
            ]);
        }
        $pending = LoginChallenge::query()->create([
            'user_id' => $user->id,
            'code_hash' => str_repeat('a', 64),
            'expires_at' => now()->addMinutes(10),
            'attempts' => 0,
            'resend_count' => 0,
            'last_sent_at' => now(),
        ]);
        $token = $this->requestToken($user);

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))->assertOk();

        $this->assertDatabaseMissing('sessions', ['user_id' => $user->id]);
        $this->assertDatabaseHas('sessions', ['user_id' => $other->id]);
        // Il codice in attesa non vale più: resta solo quello appena inviato
        $this->assertModelMissing($pending);
        $this->assertSame(session(AuthSession::CHALLENGE_ID), LoginChallenge::query()->where('user_id', $user->id)->sole()->id);
    }

    public function test_a_link_works_only_once(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);
        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))->assertOk();

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token, 'un-altra-frase-ancora'))
            ->assertUnprocessable()
            ->assertJsonPath('message', self::INVALID_LINK)
            ->assertJsonPath('errors.token.0', self::INVALID_LINK);

        $this->assertTrue(Hash::check(self::NEW_PASSWORD, (string) $user->fresh()?->password));
        // Il link già usato non avvia un altro codice
        Mail::assertQueued(LoginCodeMail::class, 1);
    }

    public function test_a_link_expires_after_sixty_minutes(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);

        $this->travel(61)->minutes();

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))
            ->assertUnprocessable()
            ->assertJsonPath('errors.token.0', self::INVALID_LINK);
    }

    public function test_a_wrong_token_or_another_email_gets_the_same_error(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $token = $this->requestToken($user);

        $this->postJson('/api/auth/reset-password', $this->payload($user, str_repeat('0', 64)))
            ->assertUnprocessable()
            ->assertJsonPath('errors.token.0', self::INVALID_LINK);
        $this->postJson('/api/auth/reset-password', $this->payload($other, $token))
            ->assertUnprocessable()
            ->assertJsonPath('errors.token.0', self::INVALID_LINK);
        $this->postJson('/api/auth/reset-password', ['email' => 'nessuno@example.test', 'token' => $token, 'password' => self::NEW_PASSWORD, 'password_confirmation' => self::NEW_PASSWORD])
            ->assertUnprocessable()
            ->assertJsonPath('errors.token.0', self::INVALID_LINK);

        Mail::assertNotQueued(LoginCodeMail::class);
        $this->assertDatabaseCount('login_challenges', 0);
    }

    public function test_a_user_disabled_after_the_request_cannot_use_the_link(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);
        $user->forceFill(['status' => UserStatus::Disabled])->save();

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))
            ->assertUnprocessable()
            ->assertJsonPath('errors.token.0', self::INVALID_LINK);

        Mail::assertNotQueued(PasswordChangedMail::class);
        Mail::assertNotQueued(LoginCodeMail::class);
        $this->assertNull(session(AuthSession::CHALLENGE_ID));
        $this->assertDatabaseCount('login_challenges', 0);
    }

    public function test_a_short_password_is_rejected_and_the_link_stays_valid(): void
    {
        $user = User::factory()->create();
        $token = $this->requestToken($user);

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token, 'troppo-poca'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))->assertOk();
    }

    public function test_a_compromised_password_is_rejected(): void
    {
        config(['auth.password_uncompromised' => true]);
        $password = 'password-trafugata-1';
        $suffix = strtoupper(substr(sha1($password), 5));
        Http::fake(['api.pwnedpasswords.com/*' => Http::response($suffix.':42')]);
        $user = User::factory()->create();
        $token = $this->requestToken($user);

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token, $password))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');
    }

    public function test_the_hibp_call_is_logged_on_its_channel(): void
    {
        config(['auth.password_uncompromised' => true]);
        Http::fake(['api.pwnedpasswords.com/*' => Http::response('')]);
        $user = User::factory()->create();
        $token = $this->requestToken($user);
        Log::shouldReceive('channel')->with('hibp')->once()->andReturnSelf();
        Log::shouldReceive('info')->once();
        Log::shouldReceive('channel')->andReturnSelf()->byDefault();

        $this->postJson('/api/auth/reset-password', $this->payload($user, $token))->assertOk();
    }

    public function test_missing_or_malformed_fields_are_rejected(): void
    {
        $this->postJson('/api/auth/reset-password', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email', 'token', 'password']);

        $this->postJson('/api/auth/reset-password', ['email' => ['x'], 'token' => ['x'], 'password' => ['x']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email', 'token', 'password']);
    }

    public function test_requests_are_limited_to_ten_per_minute_per_ip(): void
    {
        $invalid = ['email' => 'a@example.test', 'token' => 'x', 'password' => self::NEW_PASSWORD, 'password_confirmation' => self::NEW_PASSWORD];

        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->postJson('/api/auth/reset-password', $invalid)->assertUnprocessable();
        }

        $this->postJson('/api/auth/reset-password', $invalid)->assertTooManyRequests();
    }
}
