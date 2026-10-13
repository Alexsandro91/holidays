<?php

namespace Tests\Feature\Users;

use App\Models\Invitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvitationModelTest extends TestCase
{
    use RefreshDatabase;

    public function test_belongs_to_the_invited_user_and_the_inviter(): void
    {
        $admin = User::factory()->admin()->create();
        $invitation = Invitation::factory()->create(['invited_by' => $admin->id]);

        $this->assertTrue($invitation->user?->is($invitation->user()->first()));
        $this->assertTrue($invitation->inviter?->is($admin));
        $this->assertTrue($invitation->user?->invitation?->is($invitation));
    }

    public function test_knows_when_it_is_expired_or_accepted(): void
    {
        $this->assertFalse(Invitation::factory()->create()->isExpired());
        $this->assertTrue(Invitation::factory()->expired()->create()->isExpired());
        $this->assertFalse(Invitation::factory()->create()->isAccepted());
        $this->assertTrue(Invitation::factory()->accepted()->create()->isAccepted());
    }

    public function test_never_serializes_the_token_hash(): void
    {
        $this->assertArrayNotHasKey('token_hash', Invitation::factory()->create()->toArray());
    }

    public function test_is_deleted_with_its_user(): void
    {
        $invitation = Invitation::factory()->create();

        $invitation->user?->delete();

        $this->assertModelMissing($invitation);
    }
}
