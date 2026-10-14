<?php

namespace Tests\Feature\Users;

use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Models\User;
use App\Services\InvitationService;
use App\Services\UserManagementService;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
    ];

    /**
     * Azioni ammesse per ruolo di chi agisce e tipo di destinatario.
     *
     * @var array<string, array<string, list<string>>>
     */
    private const ALLOWED = [
        'employee' => ['employee' => [], 'manager' => [], 'admin' => [], 'self' => []],
        'manager' => [
            'employee' => ['resend', 'cancel', 'change_role', 'disable', 'enable'],
            'manager' => ['resend', 'cancel', 'change_role', 'disable', 'enable'],
            'admin' => [],
            'self' => ['resend', 'cancel', 'enable'],
        ],
        'admin' => [
            'employee' => ['resend', 'cancel', 'change_role', 'disable', 'enable'],
            'manager' => ['resend', 'cancel', 'change_role', 'disable', 'enable'],
            'admin' => ['resend', 'cancel', 'disable', 'enable'],
            'self' => ['resend', 'cancel', 'enable'],
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
                        // Su sé stessi l'azione è permessa ma lo stato (attivo) non la consente
                        $target === 'self' => Response::HTTP_CONFLICT,
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
            ->json($method, str_replace('{user}', (string) $subject->id, $template), ['role' => $newRole, 'current_password' => 'password'])
            ->assertStatus($expected);
    }

    public function test_a_manager_invites_employees_and_managers_but_never_admins(): void
    {
        $manager = User::factory()->manager()->create();

        foreach (['employee', 'manager'] as $index => $role) {
            $this->actingAs($manager)->postJson('/api/users', ['name' => 'Sara Colombo', 'email' => "sara{$index}@example.test", 'role' => $role])
                ->assertCreated()
                ->assertJsonPath('data.role', $role);
        }

        $this->actingAs($manager)->postJson('/api/users', ['name' => 'Sara Colombo', 'email' => 'sara9@example.test', 'role' => 'admin'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');
    }

    public function test_a_manager_sees_every_user_including_admins(): void
    {
        $manager = User::factory()->manager()->create();
        User::factory()->admin()->create();
        User::factory()->create();

        $this->actingAs($manager)->getJson('/api/users')->assertOk()->assertJsonCount(3, 'data');
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
        $this->actingAs($manager)->deleteJson("/api/administrators/{$admin->id}", ['role' => 'employee', 'current_password' => 'password'])->assertForbidden();
    }
}
