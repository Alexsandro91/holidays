<?php

namespace Tests\Feature\Profile;

use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Session\ArraySessionHandler;
use Illuminate\Session\Store;
use Tests\TestCase;

/**
 * `meta.session` (fase 4, §2.1): durate in secondi calcolate dal server.
 */
class SessionMetaTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_current_user_carries_names_and_session_meta(): void
    {
        $user = User::factory()->create(['first_name' => 'Anna', 'last_name' => 'Verdi']);
        $loggedInAt = now()->subMinutes(10)->getTimestamp();

        $this->actingAs($user)->fromFrontend()->withSession([AuthSession::LOGGED_IN_AT => $loggedInAt])
            ->getJson('/api/auth/user')
            ->assertOk()
            ->assertJsonPath('data.first_name', 'Anna')
            ->assertJsonPath('data.last_name', 'Verdi')
            ->assertJsonPath('meta.session.idle_timeout_seconds', config('session.lifetime') * 60)
            ->assertJsonPath('meta.session.absolute_remaining_seconds', config('session.absolute_lifetime') * 60 - 600);
    }

    public function test_without_a_login_timestamp_the_whole_absolute_lifetime_remains(): void
    {
        $this->actingAs(User::factory()->create())
            ->getJson('/api/auth/user')
            ->assertOk()
            ->assertJsonPath('meta.session.absolute_remaining_seconds', config('session.absolute_lifetime') * 60);
    }

    public function test_the_helper_never_goes_below_zero_past_the_expiry(): void
    {
        $request = Request::create('/');
        $session = new Store('test', new ArraySessionHandler(120));
        $session->put(AuthSession::LOGGED_IN_AT, now()->subDays(2)->getTimestamp());
        $request->setLaravelSession($session);

        $this->assertSame(0, AuthSession::absoluteRemainingSeconds($request));
    }

    public function test_the_helper_without_session_or_timestamp_returns_the_full_lifetime(): void
    {
        $full = (int) config('session.absolute_lifetime') * 60;

        $this->assertSame($full, AuthSession::absoluteRemainingSeconds(Request::create('/')));

        $request = Request::create('/');
        $request->setLaravelSession(new Store('test', new ArraySessionHandler(120)));
        $this->assertSame($full, AuthSession::absoluteRemainingSeconds($request));
    }
}
