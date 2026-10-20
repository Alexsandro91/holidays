<?php

namespace Tests\Feature\Users;

use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Http\Resources\ManagedUserResource;
use App\Models\User;
use App\Services\InvitationService;
use App\Services\UserManagementService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Tests\TestCase;

/**
 * Matrice HTTP dei permessi (spec del 14/10, §2 e §6): chi agisce (dipendente, responsabile, admin) su chi
 * (dipendente, responsabile, admin, sé stesso), per ogni azione sulla singola persona.
 */
class UserPermissionsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Azione => [metodo, rotta, stato del destinatario, codice di successo].
     *
     * @var array<string, array{string, string, UserStatus, int}>
     */
    private const ACTIONS = [
        'resend' => ['POST', '/api/users/{user}/invitation', UserStatus::Invited, Response::HTTP_ACCEPTED],
        'cancel' => ['DELETE', '/api/users/{user}/invitation', UserStatus::Invited, Response::HTTP_NO_CONTENT],
        'change_role' => ['PATCH', '/api/users/{user}/role', UserStatus::Active, Response::HTTP_OK],
        'disable' => ['POST', '/api/users/{user}/disable', UserStatus::Active, Response::HTTP_OK],
        'enable' => ['POST', '/api/users/{user}/enable', UserStatus::Disabled, Response::HTTP_OK],
        'update' => ['PATCH', '/api/users/{user}', UserStatus::Active, Response::HTTP_OK],
    ];

    /**
     * Azioni ammesse per ruolo di chi agisce e tipo di destinatario.
     *
     * @var array<string, array<string, list<string>>>
     */
    private const ALLOWED = [
        'employee' => ['employee' => [], 'manager' => [], 'admin' => [], 'self' => []],
        'manager' => [
            'employee' => ['resend', 'cancel', 'change_role', 'disable', 'enable', 'update'],
            'manager' => ['resend', 'cancel', 'change_role', 'disable', 'enable', 'update'],
            'admin' => [],
            'self' => ['resend', 'cancel', 'enable', 'update'],
        ],
        'admin' => [
            'employee' => ['resend', 'cancel', 'change_role', 'disable', 'enable', 'update'],
            'manager' => ['resend', 'cancel', 'change_role', 'disable', 'enable', 'update'],
            'admin' => ['resend', 'cancel', 'disable', 'enable', 'update'],
            'self' => ['resend', 'cancel', 'enable', 'update'],
        ],
    ];

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
    }

    /**
     * @return array<string, array{string, string, string, int}>
     */
    public static function matrix(): array
    {
        $cases = [];

        foreach (self::ALLOWED as $actorRole => $targets) {
            foreach ($targets as $target => $allowed) {
                foreach (self::ACTIONS as $action => [, , , $success]) {
                    $expected = match (true) {
                        ! in_array($action, $allowed, true) => Response::HTTP_FORBIDDEN,
                        // Su sé stessi l'azione è permessa ma lo stato (attivo) non la consente; la modifica sì
                        $target === 'self' && $action !== 'update' => Response::HTTP_CONFLICT,
                        default => $success,
                    };
                    $cases["{$actorRole} → {$target}: {$action}"] = [$actorRole, $target, $action, $expected];
                }
            }
        }

        return $cases;
    }

    #[DataProvider('matrix')]
    public function test_who_can_act_on_whom(string $actorRole, string $target, string $action, int $expected): void
    {
        [$method, $template, $status] = self::ACTIONS[$action];
        $actor = User::factory()->create(['role' => $actorRole]);
        $subject = $target === 'self' ? $actor : User::factory()->create([
            'role' => $target,
            'status' => $status,
            'password' => $status === UserStatus::Invited ? null : 'password',
        ]);
        $newRole = $subject->role === Role::Employee ? 'manager' : 'employee';

        $this->actingAs($actor)
            ->json($method, str_replace('{user}', (string) $subject->id, $template), ['role' => $newRole, 'current_password' => 'password', 'first_name' => 'Sara', 'last_name' => 'Colombo'])
            ->assertStatus($expected);
    }

    public function test_a_manager_invites_employees_and_managers_but_never_admins(): void
    {
        $manager = User::factory()->manager()->create();

        foreach (['employee', 'manager'] as $index => $role) {
            $this->actingAs($manager)->postJson('/api/users', ['first_name' => 'Sara', 'last_name' => 'Colombo', 'email' => "sara{$index}@example.test", 'role' => $role])
                ->assertCreated()
                ->assertJsonPath('data.role', $role);
        }

        $this->actingAs($manager)->postJson('/api/users', ['first_name' => 'Sara', 'last_name' => 'Colombo', 'email' => 'sara9@example.test', 'role' => 'admin'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');
    }

    public function test_a_manager_sees_every_user_except_admins(): void
    {
        $manager = User::factory()->manager()->create();
        User::factory()->admin()->create();
        User::factory()->create();

        $this->actingAs($manager)->getJson('/api/users')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_a_manager_on_a_target_promoted_meanwhile_gets_a_conflict(): void
    {
        $manager = User::factory()->manager()->create();
        User::factory()->admin()->create();
        $service = app(UserManagementService::class);

        $calls = [
            'change_role' => fn (User $stale): User => $service->changeRole($stale, Role::Manager, $manager, request()),
            'disable' => fn (User $stale): User => $service->disable($stale, $manager, request(), false),
            'enable' => fn (User $stale): User => $service->enable($stale, $manager, request(), false),
        ];

        foreach ($calls as $action => $call) {
            $stale = User::factory()->create(['status' => $action === 'enable' ? UserStatus::Disabled : UserStatus::Active]);
            User::query()->whereKey($stale->id)->update(['role' => 'admin']);

            try {
                $call($stale);
                $this->fail("{$action}: expected ConflictHttpException");
            } catch (ConflictHttpException $exception) {
                $this->assertSame(__('users.state_changed'), $exception->getMessage());
                $this->assertSame(Role::Admin, $stale->fresh()?->role);
            }
        }

        $this->assertDatabaseCount('auth_events', 0);
    }

    public function test_a_manager_on_an_invitation_that_became_an_admin_one_gets_a_conflict(): void
    {
        $manager = User::factory()->manager()->create();
        $service = app(InvitationService::class);

        foreach (['resend', 'cancel'] as $action) {
            $stale = User::factory()->invited()->create();
            User::query()->whereKey($stale->id)->update(['role' => 'admin']);

            try {
                $action === 'resend' ? $service->resend($stale, $manager, request()) : $service->cancel($stale, $manager, request());
                $this->fail("{$action}: expected ConflictHttpException");
            } catch (ConflictHttpException $exception) {
                $this->assertSame(__('users.state_changed'), $exception->getMessage());
                $this->assertModelExists($stale);
            }
        }

        $this->assertDatabaseCount('invitations', 0);
        Mail::assertNothingQueued();
    }

    public function test_a_manager_demoted_meanwhile_is_refused(): void
    {
        $staleManager = User::factory()->manager()->create();
        User::query()->whereKey($staleManager->id)->update(['role' => 'employee']);
        $employee = User::factory()->create();
        $invited = User::factory()->invited()->create();

        $attempts = [
            fn () => app(UserManagementService::class)->changeRole($employee, Role::Manager, $staleManager, request()),
            fn () => app(UserManagementService::class)->disable($employee, $staleManager, request(), false),
            fn () => app(InvitationService::class)->resend($invited, $staleManager, request()),
            fn () => app(InvitationService::class)->cancel($invited, $staleManager, request()),
        ];

        foreach ($attempts as $index => $attempt) {
            try {
                $attempt();
                $this->fail("Tentativo {$index}: expected AuthorizationException");
            } catch (AuthorizationException $exception) {
                $this->assertSame(__('users.no_longer_allowed'), $exception->getMessage());
            }
        }

        $this->assertSame(Role::Employee, $employee->fresh()?->role);
        $this->assertSame(UserStatus::Active, $employee->fresh()?->status);
        $this->assertModelExists($invited);
        $this->assertDatabaseMissing('auth_events', ['actor_id' => $staleManager->id, 'event' => AuthEventType::RoleChanged->value]);
    }

    public function test_a_manager_never_reaches_the_administrators_section(): void
    {
        $manager = User::factory()->manager()->create();
        $employee = User::factory()->create();
        $admin = User::factory()->admin()->create();

        $this->actingAs($manager)->getJson('/api/administrators')->assertForbidden();
        $this->actingAs($manager)->postJson('/api/administrators', ['user_id' => $employee->id, 'current_password' => 'password'])->assertForbidden();
        $this->actingAs($manager)->postJson('/api/administrators/invitations', ['first_name' => 'Nora', 'last_name' => 'Neri', 'email' => 'nora@example.test', 'current_password' => 'password'])->assertForbidden();
        $this->actingAs($manager)->deleteJson("/api/administrators/{$admin->id}", ['role' => 'employee', 'current_password' => 'password'])->assertForbidden();
    }

    public function test_an_actor_disabled_meanwhile_is_refused(): void
    {
        $staleManager = User::factory()->manager()->create();
        User::query()->whereKey($staleManager->id)->update(['status' => 'disabled']);
        $employee = User::factory()->create();
        $invited = User::factory()->invited()->create();

        $attempts = [
            fn () => app(UserManagementService::class)->changeRole($employee, Role::Manager, $staleManager, request()),
            fn () => app(UserManagementService::class)->disable($employee, $staleManager, request(), false),
            fn () => app(InvitationService::class)->resend($invited, $staleManager, request()),
            fn () => app(InvitationService::class)->cancel($invited, $staleManager, request()),
        ];

        foreach ($attempts as $index => $attempt) {
            try {
                $attempt();
                $this->fail("Tentativo {$index}: expected AuthorizationException");
            } catch (AuthorizationException $exception) {
                $this->assertSame(__('users.no_longer_allowed'), $exception->getMessage());
            }
        }

        $this->assertSame(Role::Employee, $employee->fresh()?->role);
        $this->assertSame(UserStatus::Active, $employee->fresh()?->status);
        $this->assertModelExists($invited);
        $this->assertDatabaseCount('auth_events', 0);
    }

    public function test_an_admin_demoted_while_acting_on_another_admin_gets_403(): void
    {
        $staleAdmin = User::factory()->admin()->create();
        User::factory()->admin()->create();
        $activeAdmin = User::factory()->admin()->create();
        $disabledAdmin = User::factory()->admin()->disabled()->create();
        $invitedAdmin = User::factory()->admin()->invited()->create();
        // Un altro admin lo ha appena reso responsabile: l'istanza in memoria è ancora admin
        User::query()->whereKey($staleAdmin->id)->update(['role' => 'manager']);

        $attempts = [
            'disable' => fn () => app(UserManagementService::class)->disable($activeAdmin, $staleAdmin, request(), true),
            'enable' => fn () => app(UserManagementService::class)->enable($disabledAdmin, $staleAdmin, request(), true),
            'resend' => fn () => app(InvitationService::class)->resend($invitedAdmin, $staleAdmin, request()),
            'cancel' => fn () => app(InvitationService::class)->cancel($invitedAdmin, $staleAdmin, request()),
        ];

        foreach ($attempts as $action => $attempt) {
            try {
                $attempt();
                $this->fail("{$action}: expected AuthorizationException");
            } catch (AuthorizationException $exception) {
                $this->assertSame(__('users.no_longer_allowed'), $exception->getMessage());
            }
        }

        $this->assertSame(UserStatus::Active, $activeAdmin->fresh()?->status);
        $this->assertSame(UserStatus::Disabled, $disabledAdmin->fresh()?->status);
        $this->assertModelExists($invitedAdmin);
        Mail::assertNothingQueued();
    }

    /**
     * @return array<string, array{string, string}>
     */
    public static function viewers(): array
    {
        $cases = [];

        foreach (['employee', 'manager', 'admin'] as $actorRole) {
            foreach (['employee', 'manager', 'admin', 'self'] as $target) {
                $cases["{$actorRole} → {$target}"] = [$actorRole, $target];
            }
        }

        return $cases;
    }

    #[DataProvider('viewers')]
    public function test_the_row_permissions_match_the_policy(string $actorRole, string $target): void
    {
        $actor = User::factory()->create(['role' => $actorRole]);
        $subject = $target === 'self' ? $actor : User::factory()->create(['role' => $target]);
        $request = Request::create('/api/users');
        $request->setUserResolver(fn (): User => $actor);

        $can = (new ManagedUserResource($subject))->toArray($request)['can'];

        $abilities = ['resend_invitation' => 'resendInvitation', 'cancel_invitation' => 'cancelInvitation', 'change_role' => 'changeRole', 'disable' => 'disable', 'enable' => 'enable', 'update' => 'update', 'send_password_reset' => 'sendPasswordReset', 'change_location' => 'changeLocation', 'manage_schedule' => 'manageSchedule', 'view_history' => 'viewHistory', 'manage_absence_types' => 'manageAbsenceTypes'];
        $this->assertSame(array_keys($abilities), array_keys($can));
        foreach ($abilities as $key => $ability) {
            $this->assertSame(Gate::forUser($actor)->allows($ability, $subject), $can[$key], $key);
        }
    }
}
