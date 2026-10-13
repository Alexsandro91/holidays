<?php

namespace Tests\Feature\Http;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ApiRateLimitTest extends TestCase
{
    use RefreshDatabase;

    public function test_authenticated_api_calls_are_limited_to_sixty_per_minute_per_user(): void
    {
        $user = User::factory()->create();

        for ($call = 0; $call < 60; $call++) {
            $this->actingAs($user)->getJson('/api/auth/user')->assertOk();
        }

        $this->actingAs($user)->getJson('/api/auth/user')->assertTooManyRequests();
        // Il contatore è per utente: un collega dallo stesso IP non è bloccato
        $this->actingAs(User::factory()->create())->getJson('/api/auth/user')->assertOk();
    }
}
