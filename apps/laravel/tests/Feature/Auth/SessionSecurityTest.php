<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Concerns\CompletesLogin;
use Tests\TestCase;

class SessionSecurityTest extends TestCase
{
    use CompletesLogin, RefreshDatabase;

    public function test_a_disabled_user_is_signed_out_on_the_next_request(): void
    {
        $user = User::factory()->disabled()->create();

        $this->actingAs($user)
            ->getJson('/api/auth/user')
            ->assertUnauthorized()
            ->assertJsonPath('message', __('login.session_ended'));
    }

    public function test_the_session_expires_twelve_hours_after_login(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->fromFrontend()
            ->withSession([AuthSession::LOGGED_IN_AT => now()->subHours(12)->subMinute()->getTimestamp()])
            ->getJson('/api/auth/user')
            ->assertUnauthorized()
            ->assertJsonPath('message', __('login.session_expired'));
    }

    public function test_a_session_younger_than_twelve_hours_is_valid(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->fromFrontend()
            ->withSession([AuthSession::LOGGED_IN_AT => now()->subHours(11)->getTimestamp()])
            ->getJson('/api/auth/user')
            ->assertOk();
    }

    public function test_a_missing_login_timestamp_starts_counting_now(): void
    {
        $this->actingAs(User::factory()->create())->fromFrontend()->getJson('/api/auth/user')->assertOk();

        $this->assertIsInt(session(AuthSession::LOGGED_IN_AT));
    }

    public function test_logout_ends_the_session_and_is_logged(): void
    {
        $user = User::factory()->create();
        $this->completeLogin($user);

        $this->postJson('/api/auth/logout')->assertNoContent();

        $this->assertGuest();
        $this->assertDatabaseHas('auth_events', ['user_id' => $user->id, 'event' => 'logged_out']);
    }
}
