<?php

namespace Tests\Feature\Auth;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CurrentUserTest extends TestCase
{
    use RefreshDatabase;

    public function test_guests_receive_a_json_401(): void
    {
        $this->getJson('/api/auth/user')
            ->assertUnauthorized()
            ->assertJsonStructure(['message']);
    }

    public function test_authenticated_users_receive_their_own_resource(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)
            ->getJson('/api/auth/user')
            ->assertOk()
            ->assertJsonPath('data.email', $user->email)
            ->assertJsonMissingPath('data.password');
    }

    public function test_fortify_routes_live_under_api_auth(): void
    {
        $this->assertSame(url('/api/auth/login'), route('login.store'));
        $this->assertSame(url('/api/auth/logout'), route('logout'));
    }
}
