<?php

namespace Tests\Feature\Users;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
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

    public function test_invited_users_have_no_password_and_are_not_active(): void
    {
        $user = User::factory()->invited()->create();

        $this->assertNull($user->password);
        $this->assertNull($user->email_verified_at);
        $this->assertFalse($user->isActive());
    }

    public function test_role_labels_are_translated(): void
    {
        app()->setLocale('it');
        $this->assertSame('HR / Admin', Role::Admin->label());

        app()->setLocale('en');
        $this->assertSame('Manager', Role::Manager->label());
    }

    public function test_resource_exposes_only_public_fields(): void
    {
        $user = User::factory()->admin()->create(['last_login_at' => now()]);

        $data = (new UserResource($user))->toArray(Request::create('/'));

        $this->assertSame(
            ['id', 'name', 'email', 'role', 'role_label', 'status', 'locale', 'last_login_at'],
            array_keys($data),
        );
        $this->assertSame('admin', $data['role']);
        $this->assertSame('active', $data['status']);
    }
}
