<?php

namespace Tests\Feature\Auth;

use App\Enums\UserStatus;
use App\Mail\LoginCodeMail;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class LoginTest extends TestCase
{
    use RefreshDatabase;

    public function test_valid_credentials_start_a_code_challenge_without_logging_in(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
            ->assertOk()
            ->assertExactJson(['two_factor' => true]);

        $this->assertGuest();
        $this->assertSame(1, LoginChallenge::query()->where('user_id', $user->id)->count());
        $this->assertIsInt(session(AuthSession::CHALLENGE_ID));
        Mail::assertQueued(LoginCodeMail::class, fn (LoginCodeMail $mail): bool => $mail->hasTo($user->email));
    }

    public function test_successful_login_changes_the_session_id(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        // Sessione già avviata prima del login, come quella di un browser (spec §8.2)
        $this->get('/sanctum/csrf-cookie')->assertNoContent();
        $before = session()->getId();

        // Senza cookie di sessione (postJson lo invia solo con withCredentials) l'id cambierebbe comunque
        $this->withCredentials()
            ->withCookie((string) config('session.cookie'), $before)
            ->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
            ->assertOk();

        $this->assertNotSame($before, session()->getId());
    }

    public function test_email_with_spaces_and_capitals_is_accepted(): void
    {
        Mail::fake();
        $user = User::factory()->create(['email' => 'giulia.rossi@example.test']);

        $this->postJson('/api/auth/login', ['email' => '  Giulia.Rossi@Example.TEST ', 'password' => 'password'])
            ->assertOk();
    }

    public function test_wrong_password_returns_the_generic_error(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'wrong-password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email' => __('auth.failed')]);

        Mail::assertNothingQueued();
        $this->assertDatabaseHas('auth_events', ['user_id' => $user->id, 'event' => 'login_failed']);
    }

    public function test_unknown_email_returns_the_same_error(): void
    {
        Mail::fake();

        $this->postJson('/api/auth/login', ['email' => 'nobody@example.test', 'password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email' => __('auth.failed')]);

        $this->assertDatabaseHas('auth_events', ['user_id' => null, 'event' => 'login_failed']);
    }

    public function test_invited_and_disabled_users_get_the_same_error(): void
    {
        Mail::fake();

        foreach ([User::factory()->invited()->create(), User::factory()->disabled()->create()] as $user) {
            $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['email' => __('auth.failed')]);
        }

        Mail::assertNothingQueued();
    }

    public function test_array_email_is_a_validation_error_not_a_server_error(): void
    {
        Mail::fake();

        $this->postJson('/api/auth/login', ['email' => ['a@example.test'], 'password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['email']);

        Mail::assertNothingQueued();
    }

    public function test_login_is_throttled_after_five_attempts(): void
    {
        $user = User::factory()->create();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'wrong-password'])->assertUnprocessable();
        }

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'wrong-password'])
            ->assertTooManyRequests()
            ->assertHeader('Retry-After');
    }

    public function test_a_valid_login_rehashes_a_password_with_old_hash_parameters(): void
    {
        Mail::fake();
        $user = $this->userWithOutdatedHash();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertOk();

        $hash = (string) DB::table('users')->where('id', $user->id)->value('password');
        $this->assertFalse(Hash::needsRehash($hash));
        $this->assertTrue(Hash::check('password', $hash));
    }

    public function test_a_wrong_password_leaves_the_old_hash_untouched(): void
    {
        $user = $this->userWithOutdatedHash();
        $before = DB::table('users')->where('id', $user->id)->value('password');

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'wrong-password'])->assertUnprocessable();

        $this->assertSame($before, DB::table('users')->where('id', $user->id)->value('password'));
    }

    public function test_a_disabled_user_with_the_right_password_is_refused_and_not_rehashed(): void
    {
        Mail::fake();
        $user = $this->userWithOutdatedHash();
        $user->forceFill(['status' => UserStatus::Disabled])->save();
        $before = DB::table('users')->where('id', $user->id)->value('password');

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->assertSame($before, DB::table('users')->where('id', $user->id)->value('password'));
        Mail::assertNothingQueued();
    }

    public function test_the_rehash_can_be_turned_off_like_in_laravel(): void
    {
        Mail::fake();
        config(['hashing.rehash_on_login' => false]);
        $user = $this->userWithOutdatedHash();
        $before = DB::table('users')->where('id', $user->id)->value('password');

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertOk();

        $this->assertSame($before, DB::table('users')->where('id', $user->id)->value('password'));
    }

    /**
     * Utente con un hash creato con un costo diverso da quello configurato (scritto senza passare dal cast `hashed`).
     */
    private function userWithOutdatedHash(): User
    {
        $user = User::factory()->create();
        $outdated = Hash::make('password', ['rounds' => ((int) config('hashing.bcrypt.rounds')) + 1]);
        DB::table('users')->where('id', $user->id)->update(['password' => $outdated]);
        $this->assertTrue(Hash::needsRehash($outdated));

        return $user;
    }
}
