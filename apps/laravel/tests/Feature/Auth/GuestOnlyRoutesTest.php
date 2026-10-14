<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class GuestOnlyRoutesTest extends TestCase
{
    use RefreshDatabase;

    private const ALREADY_AUTHENTICATED = [
        'message' => 'Hai già una sessione aperta',
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
                'message' => 'You already have an open session',
                'meta' => ['reason' => 'already_authenticated'],
            ]);
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
