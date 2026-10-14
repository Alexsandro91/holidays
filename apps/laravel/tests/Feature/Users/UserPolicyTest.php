<?php

namespace Tests\Feature\Users;

use App\Enums\Role;
use App\Models\User;
use App\Policies\UserPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Matrice dei permessi (spec 14/10 §2): il responsabile gestisce gli utenti come l'admin, tranne gli admin.
 */
class UserPolicyTest extends TestCase
{
    use RefreshDatabase;

    private const TARGET_ACTIONS = ['resendInvitation', 'cancelInvitation', 'changeRole', 'disable', 'enable'];

    /**
     * Azioni ammesse per ruolo di chi agisce e tipo di destinatario ('self' è chi agisce).
     *
     * @var array<string, array<string, list<string>>>
     */
    private const ALLOWED = [
        'employee' => ['employee' => [], 'manager' => [], 'admin' => [], 'self' => []],
        'manager' => [
            'employee' => self::TARGET_ACTIONS,
            'manager' => self::TARGET_ACTIONS,
            'admin' => [],
            'self' => ['resendInvitation', 'cancelInvitation', 'enable'],
        ],
        'admin' => [
            'employee' => self::TARGET_ACTIONS,
            'manager' => self::TARGET_ACTIONS,
            'admin' => ['resendInvitation', 'cancelInvitation', 'disable', 'enable'],
            'self' => ['resendInvitation', 'cancelInvitation', 'enable'],
        ],
    ];

    /**
     * @return array<string, array{string, string, string, bool}>
     */
    public static function matrix(): array
    {
        $cases = [];

        foreach (self::ALLOWED as $actorRole => $targets) {
            foreach ($targets as $target => $allowed) {
                foreach (self::TARGET_ACTIONS as $ability) {
                    $cases["{$actorRole} → {$target}: {$ability}"] = [$actorRole, $target, $ability, in_array($ability, $allowed, true)];
                }
            }
        }

        return $cases;
    }

    #[DataProvider('matrix')]
    public function test_actions_on_a_user(string $actorRole, string $target, string $ability, bool $expected): void
    {
        $actor = User::factory()->create(['role' => $actorRole]);
        $subject = $target === 'self' ? $actor : User::factory()->create(['role' => $target]);

        $this->assertSame($expected, (new UserPolicy)->{$ability}($actor, $subject));
    }

    /**
     * @return array<string, array{string, bool, bool}>
     */
    public static function roles(): array
    {
        return [
            'dipendente' => ['employee', false, false],
            'responsabile' => ['manager', true, false],
            'admin' => ['admin', true, true],
        ];
    }

    #[DataProvider('roles')]
    public function test_who_manages_users_and_administrators(string $role, bool $managesUsers, bool $managesAdministrators): void
    {
        $policy = new UserPolicy;
        $actor = User::factory()->create(['role' => $role]);
        $otherAdmin = User::factory()->admin()->create();
        $employee = User::factory()->create();

        $this->assertSame($managesUsers, $policy->viewAny($actor));
        $this->assertSame($managesUsers, $policy->create($actor));
        $this->assertSame($managesAdministrators, $policy->manageAdministrators($actor));
        $this->assertSame($managesAdministrators, $policy->grantAdmin($actor, $employee));
        $this->assertSame($managesAdministrators, $policy->revokeAdmin($actor, $otherAdmin));
    }

    public function test_admins_cannot_revoke_themselves(): void
    {
        $admin = User::factory()->admin()->create();

        $this->assertFalse((new UserPolicy)->revokeAdmin($admin, $admin));
    }

    public function test_the_policy_never_queries_the_database(): void
    {
        $policy = new UserPolicy;
        $manager = User::factory()->manager()->create();
        $admin = User::factory()->create(['role' => Role::Admin]);
        $queries = 0;
        DB::listen(function () use (&$queries): void {
            $queries++;
        });

        foreach (self::TARGET_ACTIONS as $ability) {
            $policy->{$ability}($manager, $admin);
        }

        $this->assertSame(0, $queries);
    }
}
