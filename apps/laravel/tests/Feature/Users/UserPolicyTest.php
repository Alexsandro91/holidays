<?php

namespace Tests\Feature\Users;

use App\Models\User;
use App\Policies\UserPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserPolicyTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_admins_manage_users(): void
    {
        $policy = new UserPolicy;
        $target = User::factory()->create();

        foreach ([User::factory()->create(), User::factory()->manager()->create()] as $nonAdmin) {
            $this->assertFalse($policy->viewAny($nonAdmin));
            $this->assertFalse($policy->create($nonAdmin));
            $this->assertFalse($policy->disable($nonAdmin, $target));
            $this->assertFalse($policy->grantAdmin($nonAdmin, $target));
        }

        $admin = User::factory()->admin()->create();
        $this->assertTrue($policy->viewAny($admin));
        $this->assertTrue($policy->create($admin));
        $this->assertTrue($policy->disable($admin, $target));
        $this->assertTrue($policy->grantAdmin($admin, $target));
    }

    public function test_admins_cannot_act_on_themselves(): void
    {
        $policy = new UserPolicy;
        $admin = User::factory()->admin()->create();

        $this->assertFalse($policy->disable($admin, $admin));
        $this->assertFalse($policy->changeRole($admin, $admin));
        $this->assertFalse($policy->revokeAdmin($admin, $admin));
    }

    public function test_role_changes_never_touch_admins(): void
    {
        $policy = new UserPolicy;
        $admin = User::factory()->admin()->create();

        $this->assertFalse($policy->changeRole($admin, User::factory()->admin()->create()));
        $this->assertTrue($policy->changeRole($admin, User::factory()->manager()->create()));
    }
}
