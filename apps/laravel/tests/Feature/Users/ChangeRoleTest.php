<?php

namespace Tests\Feature\Users;

use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChangeRoleTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_admin_promotes_an_employee_to_manager(): void
    {
        $admin = User::factory()->admin()->create();
        $employee = User::factory()->create();

        $this->actingAs($admin)->patchJson("/api/users/{$employee->id}/role", ['role' => 'manager'])
            ->assertOk()
            ->assertJsonPath('data.role', 'manager');

        $this->assertSame(Role::Manager, $employee->fresh()?->role);
        $this->assertDatabaseHas('auth_events', ['user_id' => $employee->id, 'actor_id' => $admin->id, 'event' => AuthEventType::RoleChanged->value]);
    }

    public function test_the_admin_role_is_never_set_or_removed_here(): void
    {
        $admin = User::factory()->admin()->create();
        $employee = User::factory()->create();
        $otherAdmin = User::factory()->admin()->create();

        $this->actingAs($admin)->patchJson("/api/users/{$employee->id}/role", ['role' => 'admin'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');
        $this->actingAs($admin)->patchJson("/api/users/{$otherAdmin->id}/role", ['role' => 'employee'])->assertForbidden();
        $this->actingAs($admin)->patchJson("/api/users/{$admin->id}/role", ['role' => 'employee'])->assertForbidden();
    }

    public function test_non_admins_cannot_change_roles(): void
    {
        $this->actingAs(User::factory()->manager()->create())
            ->patchJson('/api/users/'.User::factory()->create()->id.'/role', ['role' => 'manager'])
            ->assertForbidden();
    }
}
