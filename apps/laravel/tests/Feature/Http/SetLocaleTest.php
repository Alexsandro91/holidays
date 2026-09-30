<?php

namespace Tests\Feature\Http;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class SetLocaleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Route::middleware('api')->get('/api/testing/locale', fn () => response()->json(['locale' => app()->getLocale()]));
    }

    public function test_defaults_to_italian_without_a_header(): void
    {
        // Il client di test invia di default 'en-us': si svuota l'header per simulare l'assenza
        $this->getJson('/api/testing/locale', ['Accept-Language' => ''])->assertJsonPath('locale', 'it');
    }

    public function test_uses_a_supported_accept_language(): void
    {
        $this->getJson('/api/testing/locale', ['Accept-Language' => 'en-GB,en;q=0.9'])->assertJsonPath('locale', 'en');
    }

    public function test_ignores_unsupported_languages(): void
    {
        $this->getJson('/api/testing/locale', ['Accept-Language' => 'de-DE,de;q=0.9'])->assertJsonPath('locale', 'it');
    }

    public function test_user_preference_wins_over_the_header(): void
    {
        $user = User::factory()->create(['locale' => 'en']);

        $this->actingAs($user)
            ->getJson('/api/testing/locale', ['Accept-Language' => 'it'])
            ->assertJsonPath('locale', 'en');
    }
}
