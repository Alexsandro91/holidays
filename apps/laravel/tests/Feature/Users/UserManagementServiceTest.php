<?php

namespace Tests\Feature\Users;

use App\Enums\Role;
use App\Models\User;
use App\Services\UserManagementService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use InvalidArgumentException;
use Tests\TestCase;

/**
 * Difese del servizio anche fuori da HTTP (senza request validata né policy).
 */
class UserManagementServiceTest extends TestCase
{
    use RefreshDatabase;

    private UserManagementService $service;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->service = app(UserManagementService::class);
    }

    public function test_revoking_never_sets_the_admin_role_again(): void
    {
        $actor = User::factory()->admin()->create();
        $target = User::factory()->admin()->create();

        try {
            $this->service->revokeAdmin($target, Role::Admin, $actor, Request::create('/'));
            $this->fail('Il nuovo ruolo non può essere admin');
        } catch (InvalidArgumentException) {
            $this->assertSame(Role::Admin, $target->fresh()?->role);
            $this->assertDatabaseCount('auth_events', 0);
        }
    }

    public function test_a_role_change_never_sets_the_admin_role(): void
    {
        $actor = User::factory()->manager()->create();
        $target = User::factory()->create();

        try {
            $this->service->changeRole($target, Role::Admin, $actor, Request::create('/'));
            $this->fail('Il cambio ruolo non può dare il ruolo admin');
        } catch (InvalidArgumentException) {
            $this->assertSame(Role::Employee, $target->fresh()?->role);
            $this->assertDatabaseCount('auth_events', 0);
        }
    }

    public function test_an_admin_cannot_revoke_themselves(): void
    {
        $actor = User::factory()->admin()->create();
        User::factory()->admin()->create();

        try {
            $this->service->revokeAdmin($actor, Role::Employee, $actor, Request::create('/'));
            $this->fail('Un admin non può revocare se stesso');
        } catch (AuthorizationException) {
            $this->assertSame(Role::Admin, $actor->fresh()?->role);
            $this->assertDatabaseCount('auth_events', 0);
        }
    }
}
