<?php

namespace Tests\Feature\Users;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Matrice di accesso di tutte le rotte di amministrazione (spec §8.1, aggiornata dalla spec del 14/10): ospite 401,
 * dipendente 403 ovunque, responsabile 403 sulla sezione Amministratori e sulle azioni verso un admin,
 * id inesistente 404; blocco della password di conferma condiviso tra le azioni sugli admin.
 */
class AdminRouteAccessTest extends TestCase
{
    use RefreshDatabase;

    private const MISSING_ID = 999999;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function adminRoutes(): array
    {
        return [
            'lista utenti' => ['GET', '/api/users'],
            'invito' => ['POST', '/api/users'],
            ...self::userRoutes(),
            'lista amministratori' => ['GET', '/api/administrators'],
            'promozione' => ['POST', '/api/administrators'],
            'invito admin' => ['POST', '/api/administrators/invitations'],
        ];
    }

    /**
     * Rotte della sezione Amministratori, riservate all'admin.
     *
     * @return array<string, array{string, string}>
     */
    public static function administratorRoutes(): array
    {
        return [
            'lista amministratori' => ['GET', '/api/administrators'],
            'promozione' => ['POST', '/api/administrators'],
            'invito admin' => ['POST', '/api/administrators/invitations'],
            'revoca admin' => ['DELETE', '/api/administrators/{user}'],
        ];
    }

    /**
     * Azioni della gestione utenti sulla singola persona.
     *
     * @return array<string, array{string, string}>
     */
    public static function personRoutes(): array
    {
        return array_diff_key(self::userRoutes(), ['revoca admin' => true]);
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function userRoutes(): array
    {
        return [
            'reinvio invito' => ['POST', '/api/users/{user}/invitation'],
            'annullamento invito' => ['DELETE', '/api/users/{user}/invitation'],
            'cambio ruolo' => ['PATCH', '/api/users/{user}/role'],
            'disattivazione' => ['POST', '/api/users/{user}/disable'],
            'riattivazione' => ['POST', '/api/users/{user}/enable'],
            'revoca admin' => ['DELETE', '/api/administrators/{user}'],
        ];
    }

    private function uri(string $template, int $userId): string
    {
        return str_replace('{user}', (string) $userId, $template);
    }

    #[DataProvider('adminRoutes')]
    public function test_guests_get_401(string $method, string $template): void
    {
        $target = User::factory()->create();

        $this->json($method, $this->uri($template, $target->id))->assertUnauthorized();
    }

    #[DataProvider('adminRoutes')]
    public function test_employees_get_403(string $method, string $template): void
    {
        $target = User::factory()->create();

        $this->actingAs(User::factory()->create())
            ->json($method, $this->uri($template, $target->id), ['current_password' => 'password'])
            ->assertForbidden();
    }

    #[DataProvider('administratorRoutes')]
    public function test_managers_get_403_on_the_administrators_section(string $method, string $template): void
    {
        $target = User::factory()->admin()->create();
        $employee = User::factory()->create();

        $this->actingAs(User::factory()->manager()->create())
            ->json($method, $this->uri($template, $target->id), ['user_id' => $employee->id, 'role' => 'employee', 'first_name' => 'Nora', 'last_name' => 'Neri', 'email' => 'nora@example.test', 'current_password' => 'password'])
            ->assertForbidden();
    }

    #[DataProvider('personRoutes')]
    public function test_managers_get_403_on_an_admin(string $method, string $template): void
    {
        foreach ([User::factory()->admin()->create(), User::factory()->admin()->invited()->create(), User::factory()->admin()->disabled()->create()] as $target) {
            $this->actingAs(User::factory()->manager()->create())
                ->json($method, $this->uri($template, $target->id), ['role' => 'employee', 'current_password' => 'password'])
                ->assertForbidden();
        }
    }

    #[DataProvider('userRoutes')]
    public function test_a_missing_user_gets_404(string $method, string $template): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->json($method, $this->uri($template, self::MISSING_ID), ['current_password' => 'password', 'role' => 'employee'])
            ->assertNotFound();
    }

    public function test_five_wrong_passwords_lock_promotion(): void
    {
        $admin = User::factory()->admin()->create();
        $employee = User::factory()->create();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->actingAs($admin)->postJson('/api/administrators', ['user_id' => $employee->id, 'current_password' => 'sbagliata'])
                ->assertUnprocessable();
        }

        $this->actingAs($admin)->postJson('/api/administrators', ['user_id' => $employee->id, 'current_password' => 'password'])
            ->assertTooManyRequests()
            ->assertHeader('Retry-After');
    }

    public function test_five_wrong_passwords_lock_revocation(): void
    {
        $admin = User::factory()->admin()->create();
        $otherAdmin = User::factory()->admin()->create();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->actingAs($admin)->deleteJson("/api/administrators/{$otherAdmin->id}", ['role' => 'employee', 'current_password' => 'sbagliata'])
                ->assertUnprocessable();
        }

        $this->actingAs($admin)->deleteJson("/api/administrators/{$otherAdmin->id}", ['role' => 'employee', 'current_password' => 'password'])
            ->assertTooManyRequests()
            ->assertHeader('Retry-After');
    }

    public function test_wrong_passwords_on_disable_also_lock_promotion(): void
    {
        $admin = User::factory()->admin()->create();
        $otherAdmin = User::factory()->admin()->create();
        $employee = User::factory()->create();

        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->actingAs($admin)->postJson("/api/users/{$otherAdmin->id}/disable", ['current_password' => 'sbagliata'])
                ->assertUnprocessable();
        }

        $this->actingAs($admin)->postJson('/api/administrators', ['user_id' => $employee->id, 'current_password' => 'password'])
            ->assertTooManyRequests()
            ->assertHeader('Retry-After');
    }
}
