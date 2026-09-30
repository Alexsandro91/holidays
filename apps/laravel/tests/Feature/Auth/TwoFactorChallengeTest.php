<?php

namespace Tests\Feature\Auth;

use App\Enums\UserStatus;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CompletesLogin;
use Tests\TestCase;

class TwoFactorChallengeTest extends TestCase
{
    use CompletesLogin, RefreshDatabase;

    public function test_the_right_code_logs_the_user_in(): void
    {
        $user = User::factory()->create();
        $code = $this->startLogin($user);

        $this->postJson('/api/auth/two-factor', ['code' => $code])
            ->assertOk()
            ->assertJsonPath('data.email', $user->email);

        $this->assertAuthenticatedAs($user);
        $this->assertNotNull($user->fresh()?->last_login_at);
        $this->assertSame(0, LoginChallenge::query()->count());
        $this->assertIsInt(session(AuthSession::LOGGED_IN_AT));
        $this->assertNull(session(AuthSession::CHALLENGE_ID));
        $this->assertDatabaseHas('auth_events', ['user_id' => $user->id, 'event' => 'login_succeeded']);
    }

    public function test_a_wrong_code_reports_the_attempts_left(): void
    {
        $code = $this->startLogin(User::factory()->create());

        $this->postJson('/api/auth/two-factor', ['code' => $this->wrongCode($code)])
            ->assertUnprocessable()
            ->assertJsonPath('meta.attempts_left', 4)
            ->assertJsonValidationErrors(['code']);

        $this->assertGuest();
    }

    public function test_the_fifth_wrong_code_forces_a_new_login(): void
    {
        $user = User::factory()->create();
        $code = $this->startLogin($user);

        for ($left = 4; $left >= 1; $left--) {
            $this->postJson('/api/auth/two-factor', ['code' => $this->wrongCode($code)])->assertJsonPath('meta.attempts_left', $left);
        }

        $this->postJson('/api/auth/two-factor', ['code' => $this->wrongCode($code)])->assertJsonPath('meta.restart', true);
        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertJsonPath('meta.restart', true);

        $this->assertGuest();
        $this->assertDatabaseHas('auth_events', ['user_id' => $user->id, 'event' => 'locked_out']);
    }

    public function test_an_expired_code_forces_a_new_login(): void
    {
        $code = $this->startLogin(User::factory()->create());

        $this->travel(11)->minutes();

        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertUnprocessable()->assertJsonPath('meta.restart', true);
    }

    public function test_a_code_without_a_pending_login_forces_a_new_login(): void
    {
        $this->postJson('/api/auth/two-factor', ['code' => '123456'])->assertUnprocessable()->assertJsonPath('meta.restart', true);
    }

    public function test_a_code_cannot_be_reused_after_logout(): void
    {
        $code = $this->startLogin(User::factory()->create());

        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertOk();
        $this->postJson('/api/auth/logout')->assertNoContent();

        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertJsonPath('meta.restart', true);
    }

    public function test_a_user_disabled_during_login_cannot_complete_it(): void
    {
        $user = User::factory()->create();
        $code = $this->startLogin($user);

        $user->update(['status' => UserStatus::Disabled]);

        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertJsonPath('meta.restart', true);
        $this->assertGuest();
    }

    public function test_resend_waits_for_the_cooldown_and_replaces_the_code(): void
    {
        // Il DB salva secondi interi: senza microsecondi il conto alla rovescia è esatto
        $this->freezeSecond();
        $first = $this->startLogin(User::factory()->create());

        $this->postJson('/api/auth/two-factor/resend')
            ->assertTooManyRequests()
            ->assertHeader('Retry-After', '60')
            ->assertJsonPath('meta.retry_after', 60);

        $this->travel(61)->seconds();
        $this->postJson('/api/auth/two-factor/resend')->assertAccepted();
        $second = $this->lastLoginCode();

        if ($first !== $second) {
            $this->postJson('/api/auth/two-factor', ['code' => $first])->assertJsonPath('meta.attempts_left', 4);
        }
        $this->postJson('/api/auth/two-factor', ['code' => $second])->assertOk();
    }

    public function test_resend_stops_after_three_new_codes(): void
    {
        $this->startLogin(User::factory()->create());

        for ($i = 0; $i < 3; $i++) {
            $this->travel(61)->seconds();
            $this->postJson('/api/auth/two-factor/resend')->assertAccepted();
        }

        $this->travel(61)->seconds();
        $this->postJson('/api/auth/two-factor/resend')
            ->assertTooManyRequests()
            ->assertJsonPath('meta.limit_reached', true);
    }

    public function test_code_endpoints_are_throttled_per_ip(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/auth/two-factor', ['code' => '123456'])->assertUnprocessable();
        }

        $this->postJson('/api/auth/two-factor', ['code' => '123456'])->assertTooManyRequests();
    }

    private function wrongCode(string $code): string
    {
        return $code === '000000' ? '111111' : '000000';
    }
}
