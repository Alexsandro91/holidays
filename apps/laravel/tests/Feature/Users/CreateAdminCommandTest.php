<?php

namespace Tests\Feature\Users;

use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\InvitationMail;
use App\Models\Invitation;
use App\Models\User;
use App\Support\Translate;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class CreateAdminCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_an_invited_admin_and_emails_the_invitation(): void
    {
        Mail::fake();

        $this->artisan('app:create-admin', ['name' => 'Giulia Rossi', 'email' => ' Giulia@Example.TEST '])->assertSuccessful();

        $admin = User::query()->where('email', 'giulia@example.test')->firstOrFail();
        $this->assertSame(Role::Admin, $admin->role);
        $this->assertSame(UserStatus::Invited, $admin->status);
        $this->assertNull($admin->password);
        Mail::assertQueued(InvitationMail::class, fn (InvitationMail $mail): bool => $mail->hasTo('giulia@example.test') && $mail->inviterName === null);
        $this->assertDatabaseHas('auth_events', [
            'user_id' => $admin->id,
            'actor_id' => null,
            'event' => AuthEventType::InvitationSent->value,
        ]);
    }

    public function test_sends_a_new_link_to_an_admin_who_never_activated(): void
    {
        Mail::fake();
        $this->artisan('app:create-admin', ['name' => 'Giulia Rossi', 'email' => 'giulia@example.test'])->assertSuccessful();
        $oldHash = Invitation::query()->sole()->token_hash;
        $this->travel(80)->hours();

        $this->artisan('app:create-admin', ['name' => 'Giulia Rossi', 'email' => 'giulia@example.test'])
            ->expectsOutputToContain(Translate::text('invitations.command.resent', ['email' => 'giulia@example.test', 'hours' => 72]))
            ->assertSuccessful();

        $invitation = Invitation::query()->sole();
        $this->assertNotSame($oldHash, $invitation->token_hash);
        $this->assertFalse($invitation->isExpired());
        $this->assertSame(1, User::query()->where('email', 'giulia@example.test')->count());
        Mail::assertQueued(InvitationMail::class, 2);
        $this->assertDatabaseCount('auth_events', 2);
    }

    public function test_refuses_when_an_active_admin_exists_unless_forced(): void
    {
        Mail::fake();
        User::factory()->admin()->create();
        // Un admin disattivato o invitato non basta a bloccare il comando: conta solo quello attivo
        User::factory()->admin()->disabled()->create();

        $this->artisan('app:create-admin', ['name' => 'Giulia Rossi', 'email' => 'giulia@example.test'])
            ->expectsOutputToContain(Translate::text('invitations.command.admin_exists'))
            ->assertFailed();
        $this->assertDatabaseMissing('users', ['email' => 'giulia@example.test']);
        Mail::assertNothingQueued();

        $this->artisan('app:create-admin', ['name' => 'Giulia Rossi', 'email' => 'giulia@example.test', '--force' => true])->assertSuccessful();
        $this->assertDatabaseHas('users', ['email' => 'giulia@example.test', 'role' => Role::Admin->value]);
    }

    public function test_never_resends_the_invitation_of_a_non_admin(): void
    {
        Mail::fake();
        User::factory()->invited()->create(['email' => 'giulia@example.test']);

        $this->artisan('app:create-admin', ['name' => 'Giulia Rossi', 'email' => 'giulia@example.test'])->assertFailed();
        Mail::assertNothingQueued();
    }

    public function test_refuses_an_email_already_registered_or_invalid(): void
    {
        Mail::fake();
        User::factory()->create(['email' => 'giulia@example.test']);

        $this->artisan('app:create-admin', ['name' => 'Giulia Rossi', 'email' => 'giulia@example.test'])->assertFailed();
        $this->artisan('app:create-admin', ['name' => 'Giulia Rossi', 'email' => 'non-una-email'])->assertFailed();
        Mail::assertNothingQueued();
    }

    public function test_refuses_a_name_with_markup(): void
    {
        Mail::fake();

        $this->artisan('app:create-admin', ['name' => '[Verifica](https://phish.example)', 'email' => 'giulia@example.test'])->assertFailed();
        $this->assertDatabaseMissing('users', ['email' => 'giulia@example.test']);
    }
}
