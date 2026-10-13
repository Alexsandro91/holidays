<?php

namespace Tests\Feature\Auth;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class AuthRoutesTest extends TestCase
{
    use RefreshDatabase;

    public function test_unused_fortify_routes_are_not_registered(): void
    {
        // Rotte Fortify senza limite ai tentativi e mai usate dalla SPA
        $this->postJson('/api/auth/user/confirm-password', ['password' => 'x'])->assertNotFound();
        $this->getJson('/api/auth/user/confirmed-password-status')->assertNotFound();
    }

    public function test_login_and_logout_keep_their_middleware(): void
    {
        $login = Route::getRoutes()->getByName('login.store');
        $logout = Route::getRoutes()->getByName('logout');

        $this->assertNotNull($login);
        $this->assertNotNull($logout);
        $this->assertSame('api/auth/login', $login->uri());
        $this->assertContains('guest:web', $login->gatherMiddleware());
        $this->assertContains('throttle:login', $login->gatherMiddleware());
        $this->assertContains('auth:web', $logout->gatherMiddleware());
    }
}
