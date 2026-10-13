<?php

namespace Tests\Feature\Users;

use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\InvitationMail;
use App\Models\User;
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
    }

    public function test_refuses_an_email_already_registered_or_invalid(): void
    {
        Mail::fake();
        User::factory()->create(['email' => 'giulia@example.test']);

        $this->artisan('app:create-admin', ['name' => 'Giulia Rossi', 'email' => 'giulia@example.test'])->assertFailed();
        $this->artisan('app:create-admin', ['name' => 'Giulia Rossi', 'email' => 'non-una-email'])->assertFailed();
        Mail::assertNothingQueued();
    }
}
