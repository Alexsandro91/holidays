<?php

namespace Tests\Feature\Users;

use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\InvitationMail;
use App\Models\Invitation;
use App\Models\User;
use App\Services\InvitationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class InviteUserTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->admin = User::factory()->admin()->create(['name' => 'Anna Admin']);
    }

    /**
     * @param  array<string, string>  $overrides
     * @return array<string, string>
     */
    private function payload(array $overrides = []): array
    {
        return [...['name' => 'Sara Colombo', 'email' => 'sara@example.test', 'role' => 'employee'], ...$overrides];
    }

    private function lastInvitationToken(): string
    {
        $token = '';
        Mail::assertQueued(InvitationMail::class, function (InvitationMail $mail) use (&$token): bool {
            $token = $mail->token;

            return true;
        });

        return $token;
    }

    public function test_an_admin_invites_an_employee(): void
    {
        $response = $this->actingAs($this->admin)->postJson('/api/users', $this->payload())->assertCreated();

        $response->assertJsonPath('data.status', 'invited')->assertJsonPath('data.role', 'employee');
        $user = User::query()->where('email', 'sara@example.test')->firstOrFail();
        $this->assertSame(UserStatus::Invited, $user->status);
        $this->assertNull($user->password);
        Mail::assertQueued(InvitationMail::class, fn (InvitationMail $mail): bool => $mail->hasTo('sara@example.test')
            && $mail->inviterName === 'Anna Admin');
        $this->assertDatabaseHas('auth_events', [
            'user_id' => $user->id,
            'actor_id' => $this->admin->id,
            'event' => AuthEventType::InvitationSent->value,
        ]);
    }

    public function test_the_token_is_stored_only_as_a_hash_and_lasts_seventy_two_hours(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload())->assertCreated();

        $token = $this->lastInvitationToken();
        $invitation = Invitation::query()->sole();
        $this->assertSame(64, strlen($token));
        $this->assertSame(hash('sha256', $token), $invitation->token_hash);
        // Il database salva i secondi: tolleranza di 1 s sul confronto
        $this->assertEqualsWithDelta(now()->addHours(InvitationService::TTL_HOURS)->getTimestamp(), $invitation->expires_at->getTimestamp(), 1);
        $this->assertTrue($invitation->inviter?->is($this->admin));
    }

    public function test_admins_cannot_be_invited(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload(['role' => 'admin']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('role');
    }

    public function test_an_email_already_in_use_is_rejected_even_with_spaces_and_capitals(): void
    {
        User::factory()->create(['email' => 'sara@example.test']);

        $this->actingAs($this->admin)->postJson('/api/users', $this->payload(['email' => '  Sara@Example.TEST ']))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
        $this->assertSame(1, User::query()->where('email', 'sara@example.test')->count());
    }

    public function test_invalid_input_is_rejected(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', [])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'email', 'role']);
    }

    public function test_names_with_markup_or_control_characters_are_rejected(): void
    {
        foreach (['[Verifica](https://phish.example)', 'Sara <b>Colombo</b>', "Sara\u{0007}Colombo"] as $name) {
            $this->actingAs($this->admin)->withHeader('Accept-Language', 'it')
                ->postJson('/api/users', $this->payload(['name' => $name]))
                ->assertUnprocessable()
                ->assertJsonValidationErrors(['name' => 'Il nome non può contenere parentesi quadre, i segni < > o caratteri di controllo.']);
        }

        $this->assertDatabaseMissing('users', ['email' => 'sara@example.test']);
        Mail::assertNothingQueued();
    }

    public function test_non_admins_cannot_invite(): void
    {
        $this->actingAs(User::factory()->manager()->create())->postJson('/api/users', $this->payload())->assertForbidden();
        Mail::assertNothingQueued();
    }

    public function test_resending_replaces_the_link_and_resets_the_expiry(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload())->assertCreated();
        $oldHash = Invitation::query()->sole()->token_hash;
        $user = User::query()->where('email', 'sara@example.test')->firstOrFail();

        $this->travel(2)->hours();
        $this->actingAs($this->admin)->postJson("/api/users/{$user->id}/invitation")->assertAccepted();

        $invitation = Invitation::query()->sole();
        $this->assertNotSame($oldHash, $invitation->token_hash);
        $this->assertEqualsWithDelta(now()->addHours(InvitationService::TTL_HOURS)->getTimestamp(), $invitation->expires_at->getTimestamp(), 1);
        Mail::assertQueued(InvitationMail::class, 2);
    }

    public function test_resending_waits_sixty_seconds(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload())->assertCreated();
        $user = User::query()->where('email', 'sara@example.test')->firstOrFail();

        $this->actingAs($this->admin)->postJson("/api/users/{$user->id}/invitation")
            ->assertTooManyRequests()
            ->assertHeader('Retry-After')
            ->assertJsonStructure(['message', 'meta' => ['retry_after']]);

        $this->travel(61)->seconds();
        $this->actingAs($this->admin)->postJson("/api/users/{$user->id}/invitation")->assertAccepted();
    }

    public function test_only_invited_users_can_be_resent_or_cancelled(): void
    {
        $active = User::factory()->create();

        $this->actingAs($this->admin)->postJson("/api/users/{$active->id}/invitation")->assertConflict();
        $this->actingAs($this->admin)->deleteJson("/api/users/{$active->id}/invitation")->assertConflict();
        $this->assertModelExists($active);
    }

    public function test_cancelling_deletes_the_never_activated_user(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload())->assertCreated();
        $user = User::query()->where('email', 'sara@example.test')->firstOrFail();

        $this->actingAs($this->admin)->deleteJson("/api/users/{$user->id}/invitation")->assertNoContent();

        $this->assertModelMissing($user);
        $this->assertDatabaseCount('invitations', 0);
        $this->assertDatabaseHas('auth_events', [
            'user_id' => null,
            'actor_id' => $this->admin->id,
            'event' => AuthEventType::InvitationCancelled->value,
        ]);
    }

    public function test_an_invited_user_whose_invitation_was_pruned_stays_manageable(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload())->assertCreated();
        $user = User::query()->where('email', 'sara@example.test')->firstOrFail();

        // Invito mai accettato e scaduto da oltre 30 giorni: la pulizia giornaliera lo rimuove
        $this->travel(InvitationService::TTL_HOURS)->hours();
        $this->travel(31)->days();
        $this->artisan('model:prune', ['--model' => [Invitation::class]])->assertSuccessful();
        $this->assertDatabaseCount('invitations', 0);

        $this->actingAs($this->admin)->getJson('/api/users?filter[status]=invited')
            ->assertOk()
            ->assertJsonPath('data.0.id', $user->id)
            ->assertJsonPath('data.0.invitation_expires_at', null);
        $this->actingAs($this->admin)->getJson('/api/administrators')->assertOk();

        // Il reinvio crea un nuovo invito valido
        $this->actingAs($this->admin)->postJson("/api/users/{$user->id}/invitation")->assertAccepted();
        $invitation = Invitation::query()->sole();
        $this->assertSame($user->id, $invitation->user_id);
        $this->assertFalse($invitation->isExpired());
        $this->assertTrue(app(InvitationService::class)->findByToken($this->lastInvitationToken())?->is($invitation));
    }

    public function test_an_invited_user_without_invitation_can_be_cancelled(): void
    {
        $user = User::factory()->invited()->create();

        $this->actingAs($this->admin)->deleteJson("/api/users/{$user->id}/invitation")->assertNoContent();

        $this->assertModelMissing($user);
    }

    public function test_managers_can_be_invited(): void
    {
        $this->actingAs($this->admin)->postJson('/api/users', $this->payload(['role' => 'manager']))->assertCreated();

        $this->assertSame(Role::Manager, User::query()->where('email', 'sara@example.test')->firstOrFail()->role);
    }
}
