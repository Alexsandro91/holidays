<?php

namespace Tests\Feature\Users;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class UserModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_factory_creates_an_active_employee_with_italian_locale(): void
    {
        $user = User::factory()->create();

        $this->assertSame(Role::Employee, $user->role);
        $this->assertSame(UserStatus::Active, $user->status);
        $this->assertSame('it', $user->preferredLocale());
        $this->assertTrue($user->isActive());
        $this->assertFalse($user->isAdmin());
    }

    public function test_role_and_status_are_not_mass_assignable(): void
    {
        // Si impostano solo nei service con forceFill
        $user = (new User)->fill(['first_name' => 'Sara', 'last_name' => 'Colombo', 'role' => 'admin', 'status' => 'active']);

        $this->assertSame('Sara Colombo', $user->name);
        $this->assertNull($user->getAttributes()['role'] ?? null);
        $this->assertNull($user->getAttributes()['status'] ?? null);
    }

    public function test_invited_users_have_no_password_and_are_not_active(): void
    {
        $user = User::factory()->invited()->create();

        $this->assertNull($user->password);
        $this->assertNull($user->email_verified_at);
        $this->assertFalse($user->isActive());
    }

    public function test_the_full_name_joins_first_and_last_name(): void
    {
        $this->assertSame('Mario De Rossi', (new User)->forceFill(['first_name' => 'Mario', 'last_name' => 'De Rossi'])->name);
        // Dati migrati con una sola parola: cognome vuoto, niente spazio finale
        $this->assertSame('Cher', (new User)->forceFill(['first_name' => 'Cher', 'last_name' => ''])->name);
    }

    /**
     * @return array<string, array{string, string, string}>
     */
    public static function storedNames(): array
    {
        return [
            'nome e cognome' => ['Giulia Rossi', 'Giulia', 'Rossi'],
            'cognome composto' => ['Mario De Rossi', 'Mario', 'De Rossi'],
            'una sola parola' => ['Cher', 'Cher', ''],
            'spazi ai lati e doppi' => ['  Anna   Maria  Verdi ', 'Anna', 'Maria  Verdi'],
            'vuoto' => ['', '', ''],
        ];
    }

    #[DataProvider('storedNames')]
    public function test_the_migration_splits_existing_names_at_the_first_space(string $stored, string $firstName, string $lastName): void
    {
        $migration = require database_path('migrations/2026_10_14_100000_split_name_on_users_table.php');

        $this->assertSame([$firstName, $lastName], $migration->splitName($stored));
    }

    public function test_role_labels_are_translated(): void
    {
        app()->setLocale('it');
        $this->assertSame('HR / Admin', Role::Admin->label());
        $this->assertSame('Utente', Role::Employee->label());

        app()->setLocale('en');
        $this->assertSame('Manager', Role::Manager->label());
    }

    public function test_resource_exposes_only_public_fields(): void
    {
        $user = User::factory()->admin()->create(['last_login_at' => now()]);

        $data = (new UserResource($user))->toArray(Request::create('/'));

        $this->assertSame(
            ['id', 'first_name', 'last_name', 'name', 'email', 'role', 'role_label', 'status', 'locale', 'last_login_at'],
            array_keys($data),
        );
        $this->assertSame('admin', $data['role']);
        $this->assertSame('active', $data['status']);
    }
}
