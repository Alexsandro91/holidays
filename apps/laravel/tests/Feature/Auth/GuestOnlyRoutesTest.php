<?php

namespace Tests\Feature\Auth;

use App\Mail\LoginCodeMail;
use App\Models\User;
use App\Support\AuthSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class GuestOnlyRoutesTest extends TestCase
{
    use RefreshDatabase;

    private const ALREADY_AUTHENTICATED = [
        'message' => 'Hai già una sessione aperta.',
        'meta' => ['reason' => 'already_authenticated'],
    ];

    public function test_a_signed_in_json_client_gets_409_from_the_login(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'web')
            ->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
            ->assertConflict()
            ->assertExactJson(self::ALREADY_AUTHENTICATED);
    }

    public function test_a_signed_in_json_client_gets_409_from_the_invitation_pages(): void
    {
        $this->actingAs(User::factory()->create(), 'web')
            ->getJson('/api/invitations/'.str_repeat('x', 64))
            ->assertConflict()
            ->assertExactJson(self::ALREADY_AUTHENTICATED);
    }

    public function test_api_routes_answer_json_even_without_the_accept_header(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'web')
            ->post('/api/auth/forgot-password', ['email' => $user->email])
            ->assertConflict()
            ->assertJsonPath('meta.reason', 'already_authenticated');
    }

    public function test_the_message_follows_the_language_of_the_user(): void
    {
        $this->actingAs(User::factory()->create(['locale' => 'en']), 'web')
            ->postJson('/api/auth/two-factor', ['code' => '123456'])
            ->assertConflict()
            ->assertExactJson([
                'message' => 'You already have an open session.',
                'meta' => ['reason' => 'already_authenticated'],
            ]);
    }

    public function test_a_disabled_user_with_an_open_session_can_sign_in_again_from_scratch(): void
    {
        Mail::fake();
        $user = User::factory()->disabled()->create();

        // Niente 409: la sessione dell'account disattivato si chiude e la richiesta prosegue come quella di un ospite
        $this->actingAs($user, 'web')
            ->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->assertGuest('web');
    }

    public function test_a_session_past_its_absolute_lifetime_can_sign_in_again(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $this->actingAs($user, 'web')
            ->withSession([AuthSession::LOGGED_IN_AT => now()->subHours(12)->subMinute()->getTimestamp()])
            ->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
            ->assertOk()
            ->assertExactJson(['two_factor' => true]);

        $this->assertGuest('web');
        Mail::assertQueued(LoginCodeMail::class);
    }

    public function test_a_session_within_its_lifetime_still_gets_409(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'web')
            ->withSession([AuthSession::LOGGED_IN_AT => now()->subHours(11)->getTimestamp()])
            ->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
            ->assertConflict();

        $this->assertAuthenticatedAs($user, 'web');
    }

    public function test_html_requests_outside_the_api_are_still_redirected(): void
    {
        Route::middleware(['web', 'guest:web'])->get('/solo-ospiti', fn (): string => 'ok');

        $this->actingAs(User::factory()->create(), 'web')
            ->get('/solo-ospiti')
            ->assertRedirect('/');
    }

    public function test_guests_still_reach_the_routes(): void
    {
        $this->getJson('/api/invitations/'.str_repeat('x', 64))->assertNotFound();
    }
}
