<?php

namespace Tests\Feature\Users;

use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Mail\AdminChangeMail;
use App\Models\AuthEvent;
use App\Models\User;
use App\Services\UserManagementService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Tests\TestCase;

class AdministratorsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->admin = User::factory()->admin()->create(['first_name' => 'Anna', 'last_name' => 'Admin']);
    }

    public function test_lists_only_administrators(): void
    {
        User::factory()->admin()->create(['first_name' => 'Bruno', 'last_name' => 'Admin']);
        User::factory()->create();

        $this->actingAs($this->admin)->getJson('/api/administrators')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('data.0.name', 'Anna Admin')
            ->assertJsonPath('data.0.is_current_user', true);
    }

    public function test_non_admins_cannot_see_or_change_administrators(): void
    {
        $manager = User::factory()->manager()->create();

        $this->actingAs($manager)->getJson('/api/administrators')->assertForbidden();
        $this->actingAs($manager)->postJson('/api/administrators', ['user_id' => $manager->id, 'current_password' => 'password'])->assertForbidden();
    }

    public function test_promotes_an_active_user_with_the_password(): void
    {
        $employee = User::factory()->create(['first_name' => 'Marco', 'last_name' => 'Bianchi']);
        $otherAdmin = User::factory()->admin()->create();

        $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => $employee->id, 'current_password' => 'password'])
            ->assertOk()
            ->assertJsonPath('data.role', 'admin');

        $this->assertSame(Role::Admin, $employee->fresh()?->role);
        $this->assertDatabaseHas('auth_events', ['user_id' => $employee->id, 'actor_id' => $this->admin->id, 'event' => AuthEventType::AdminGranted->value]);
        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($employee->email));
        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($otherAdmin->email));
        Mail::assertNotQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($this->admin->email));
    }

    public function test_promotion_needs_the_right_password(): void
    {
        $employee = User::factory()->create();

        $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => $employee->id, 'current_password' => 'sbagliata'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('current_password');
        $this->assertSame(Role::Employee, $employee->fresh()?->role);
    }

    public function test_only_active_non_admin_users_can_be_promoted(): void
    {
        foreach ([User::factory()->invited()->create(), User::factory()->disabled()->create(), User::factory()->admin()->create()] as $target) {
            $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => $target->id, 'current_password' => 'password'])
                ->assertConflict();
        }

        $this->actingAs($this->admin)->postJson('/api/administrators', ['user_id' => 999999, 'current_password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('user_id');
    }

    public function test_revokes_an_admin_choosing_the_new_role(): void
    {
        $otherAdmin = User::factory()->admin()->create();

        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$otherAdmin->id}", ['role' => 'manager', 'current_password' => 'password'])
            ->assertOk()
            ->assertJsonPath('data.role', 'manager');

        $this->assertDatabaseHas('auth_events', ['user_id' => $otherAdmin->id, 'actor_id' => $this->admin->id, 'event' => AuthEventType::AdminRevoked->value]);
        Mail::assertQueued(AdminChangeMail::class, fn (AdminChangeMail $mail): bool => $mail->hasTo($otherAdmin->email));
    }

    public function test_cannot_revoke_themselves_nor_a_non_admin(): void
    {
        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$this->admin->id}", ['role' => 'employee', 'current_password' => 'password'])
            ->assertForbidden();
        $employee = User::factory()->create();
        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$employee->id}", ['role' => 'employee', 'current_password' => 'password'])
            ->assertConflict();
    }

    public function test_only_an_active_admin_can_be_revoked(): void
    {
        $invitedAdmin = User::factory()->admin()->invited()->create();
        $disabledAdmin = User::factory()->admin()->disabled()->create();

        foreach ([$invitedAdmin, $disabledAdmin] as $target) {
            $this->actingAs($this->admin)->withHeader('Accept-Language', 'it')
                ->deleteJson("/api/administrators/{$target->id}", ['role' => 'employee', 'current_password' => 'password'])
                ->assertConflict()
                ->assertJsonPath('message', __('users.admin_not_active', [], 'it'));
            $this->assertSame(Role::Admin, $target->fresh()?->role);
        }

        Mail::assertNothingQueued();
    }

    public function test_a_revoke_on_an_admin_no_longer_active_conflicts_under_lock(): void
    {
        $stale = User::factory()->admin()->create();
        User::query()->whereKey($stale->id)->update(['status' => 'disabled']);

        try {
            app(UserManagementService::class)->revokeAdmin($stale, Role::Employee, $this->admin, request());
            $this->fail('Expected ConflictHttpException');
        } catch (ConflictHttpException) {
            $this->assertSame(Role::Admin, $stale->fresh()?->role);
            $this->assertDatabaseMissing('auth_events', ['user_id' => $stale->id, 'event' => AuthEventType::AdminRevoked->value]);
            Mail::assertNothingQueued();
        }
    }

    public function test_revoking_rejects_the_admin_role_as_target_role(): void
    {
        $otherAdmin = User::factory()->admin()->create();

        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$otherAdmin->id}", ['role' => 'admin', 'current_password' => 'password'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');
    }

    public function test_a_revoked_admin_loses_access_on_the_next_request(): void
    {
        $otherAdmin = User::factory()->admin()->create();
        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$otherAdmin->id}", ['role' => 'employee', 'current_password' => 'password'])->assertOk();

        $this->actingAs($otherAdmin->fresh() ?? $otherAdmin)->getJson('/api/users')->assertForbidden();
    }

    public function test_crossed_revocations_never_leave_zero_admins(): void
    {
        $otherAdmin = User::factory()->admin()->create();

        // Prima revoca riuscita: l'altro admin diventa dipendente
        $this->actingAs($this->admin)->deleteJson("/api/administrators/{$otherAdmin->id}", ['role' => 'employee', 'current_password' => 'password'])->assertOk();

        // La revoca incrociata (partita prima che il ruolo cambiasse) arriva al service con un attore non più admin
        $this->expectException(AuthorizationException::class);
        app(UserManagementService::class)->revokeAdmin($this->admin, Role::Employee, $otherAdmin, request());
    }

    public function test_grant_on_a_target_that_became_admin_meanwhile_conflicts(): void
    {
        $stale = User::factory()->create();
        User::query()->whereKey($stale->id)->update(['role' => 'admin']);

        try {
            app(UserManagementService::class)->grantAdmin($stale, $this->admin, request());
            $this->fail('Expected ConflictHttpException');
        } catch (ConflictHttpException) {
            $this->assertDatabaseMissing('auth_events', ['user_id' => $stale->id, 'event' => AuthEventType::AdminGranted->value]);
            Mail::assertNothingQueued();
        }
    }

    public function test_grant_on_a_target_disabled_meanwhile_conflicts(): void
    {
        $stale = User::factory()->create();
        User::query()->whereKey($stale->id)->update(['status' => 'disabled']);

        try {
            app(UserManagementService::class)->grantAdmin($stale, $this->admin, request());
            $this->fail('Expected ConflictHttpException');
        } catch (ConflictHttpException) {
            $this->assertSame(Role::Employee, $stale->fresh()?->role);
            $this->assertDatabaseMissing('auth_events', ['user_id' => $stale->id, 'event' => AuthEventType::AdminGranted->value]);
        }
    }

    public function test_a_second_revoke_on_the_same_stale_instance_conflicts(): void
    {
        $stale = User::factory()->admin()->create();
        $service = app(UserManagementService::class);

        $service->revokeAdmin($stale, Role::Manager, $this->admin, request());

        try {
            $service->revokeAdmin($stale, Role::Employee, $this->admin, request());
            $this->fail('Expected ConflictHttpException');
        } catch (ConflictHttpException) {
            $this->assertSame(Role::Manager, $stale->fresh()?->role);
            $this->assertSame(1, AuthEvent::query()->where('user_id', $stale->id)->where('event', AuthEventType::AdminRevoked->value)->count());
        }
    }
}
