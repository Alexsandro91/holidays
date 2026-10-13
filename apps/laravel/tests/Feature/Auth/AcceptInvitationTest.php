<?php

namespace Tests\Feature\Auth;

use App\Enums\AuthEventType;
use App\Enums\UserStatus;
use App\Mail\InvitationMail;
use App\Mail\LoginCodeMail;
use App\Models\Invitation;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Services\InvitationService;
use App\Support\AuthSession;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AcceptInvitationTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'una-frase-lunga-e-nuova';

    /**
     * Invita come farebbe l'admin e restituisce il token arrivato nell'email.
     */
    private function invite(string $email = 'sara@example.test'): string
    {
        Mail::fake();
        $admin = User::factory()->admin()->create();
        $this->actingAs($admin)->postJson('/api/users', ['name' => 'Sara Colombo', 'email' => $email, 'role' => 'employee'])->assertCreated();
        // Le pagine dell'invito sono da ospite
        $this->app['auth']->forgetGuards();

        $token = '';
        Mail::assertQueued(InvitationMail::class, function (InvitationMail $mail) use (&$token): bool {
            $token = $mail->token;

            return true;
        });

        return $token;
    }

    /**
     * @return array<string, string|bool>
     */
    private function acceptPayload(string $confirmation = self::PASSWORD): array
    {
        return ['password' => self::PASSWORD, 'password_confirmation' => $confirmation, 'privacy_acknowledged' => true];
    }

    public function test_shows_who_is_invited(): void
    {
        $token = $this->invite();

        $this->getJson("/api/invitations/{$token}")
            ->assertOk()
            ->assertJsonPath('data.name', 'Sara Colombo')
            ->assertJsonPath('data.email', 'sara@example.test')
            ->assertJsonStructure(['data' => ['name', 'email', 'expires_at']]);
    }

    public function test_unknown_and_expired_links(): void
    {
        $token = $this->invite();

        $this->getJson('/api/invitations/'.str_repeat('x', 64))->assertNotFound();
        $this->travel(InvitationService::TTL_HOURS)->hours();
        $this->travel(1)->minutes();
        $this->getJson("/api/invitations/{$token}")->assertStatus(410);
        $this->postJson("/api/invitations/{$token}/accept", $this->acceptPayload())->assertStatus(410);
    }

    public function test_activating_sets_the_password_and_starts_the_code_step(): void
    {
        $token = $this->invite();

        $this->postJson("/api/invitations/{$token}/accept", $this->acceptPayload())
            ->assertOk()
            ->assertJsonPath('two_factor', true);

        $user = User::query()->where('email', 'sara@example.test')->firstOrFail();
        $this->assertSame(UserStatus::Active, $user->status);
        $this->assertTrue(Hash::check(self::PASSWORD, (string) $user->password));
        $this->assertNotNull($user->email_verified_at);
        $this->assertSame(config('app.privacy_notice_version'), $user->privacy_notice_version);
        $this->assertNotNull($user->privacy_notice_acknowledged_at);
        $this->assertNotNull($user->invitation?->accepted_at);
        $this->assertDatabaseHas('auth_events', ['user_id' => $user->id, 'event' => AuthEventType::InvitationAccepted->value]);
        // Niente sessione aperta: si entra solo con il codice
        $this->assertGuest();
        $this->assertSame(LoginChallenge::query()->where('user_id', $user->id)->value('id'), session(AuthSession::CHALLENGE_ID));
        Mail::assertQueued(LoginCodeMail::class, fn (LoginCodeMail $mail): bool => $mail->hasTo('sara@example.test'));
    }

    public function test_the_code_completes_the_first_sign_in(): void
    {
        $token = $this->invite();
        $this->postJson("/api/invitations/{$token}/accept", $this->acceptPayload())->assertOk();

        $code = '';
        Mail::assertQueued(LoginCodeMail::class, function (LoginCodeMail $mail) use (&$code): bool {
            $code = $mail->code;

            return true;
        });

        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertOk()->assertJsonPath('data.email', 'sara@example.test');
    }

    public function test_a_link_works_only_once(): void
    {
        $token = $this->invite();
        $this->postJson("/api/invitations/{$token}/accept", $this->acceptPayload())->assertOk();

        $this->getJson("/api/invitations/{$token}")->assertNotFound();
        $this->postJson("/api/invitations/{$token}/accept", $this->acceptPayload())->assertNotFound();
    }

    public function test_an_old_link_stops_working_after_a_resend(): void
    {
        $oldToken = $this->invite();
        $invitation = Invitation::query()->sole();
        $this->assertNotNull(app(InvitationService::class)->findByToken($oldToken));

        $this->travel(2)->minutes();
        $this->actingAs(User::factory()->admin()->create())->postJson("/api/users/{$invitation->user_id}/invitation")->assertAccepted();
        $this->app['auth']->forgetGuards();

        $this->getJson("/api/invitations/{$oldToken}")->assertNotFound();
    }

    public function test_a_cancelled_invitation_link_is_not_found(): void
    {
        $token = $this->invite();
        Invitation::query()->sole()->user?->delete();

        $this->getJson("/api/invitations/{$token}")->assertNotFound();
    }

    public function test_validates_password_confirmation_and_privacy(): void
    {
        $token = $this->invite();

        $this->postJson("/api/invitations/{$token}/accept", $this->acceptPayload('diversa-ma-lunga-uguale'))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');
        $this->postJson("/api/invitations/{$token}/accept", ['password' => 'corta', 'password_confirmation' => 'corta', 'privacy_acknowledged' => true])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('password');
        $this->postJson("/api/invitations/{$token}/accept", ['password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('privacy_acknowledged');

        // Nessuno di questi tentativi ha consumato il link
        $this->getJson("/api/invitations/{$token}")->assertOk();
    }

    public function test_public_invitation_pages_are_limited_to_ten_per_minute_per_ip(): void
    {
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->getJson('/api/invitations/'.str_repeat('x', 64))->assertNotFound();
        }

        $this->getJson('/api/invitations/'.str_repeat('x', 64))->assertTooManyRequests();
    }
}
