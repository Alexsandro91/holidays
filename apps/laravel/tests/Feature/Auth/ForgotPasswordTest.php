<?php

namespace Tests\Feature\Auth;

use App\Mail\ResetPasswordMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Exceptions;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Tests\Fakes\FailingMailFake;
use Tests\TestCase;

class ForgotPasswordTest extends TestCase
{
    use RefreshDatabase;

    private const SENT = ['message' => 'Se l’indirizzo corrisponde a un account attivo, riceverai un’email con il link per scegliere una nuova password.'];

    protected function setUp(): void
    {
        parent::setUp();

        // Il client di test invia 'en-us' di default: il messaggio atteso è in italiano
        $this->withHeader('Accept-Language', 'it');
    }

    public function test_an_active_user_receives_the_reset_link(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])
            ->assertAccepted()
            ->assertExactJson(self::SENT);

        Mail::assertQueued(ResetPasswordMail::class, fn (ResetPasswordMail $mail): bool => $mail->hasTo($user->email) && $mail->email === $user->email);
        $this->assertDatabaseHas('password_reset_tokens', ['email' => $user->email]);
    }

    public function test_the_token_is_stored_only_as_a_hash(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertAccepted();

        $token = '';
        Mail::assertQueued(ResetPasswordMail::class, function (ResetPasswordMail $mail) use (&$token): bool {
            $token = $mail->token;

            return true;
        });
        $stored = (string) DB::table('password_reset_tokens')->where('email', $user->email)->value('token');
        $this->assertNotSame($token, $stored);
        $this->assertTrue(Hash::check($token, $stored));
    }

    public function test_an_unknown_email_gets_the_same_response_and_no_email(): void
    {
        Mail::fake();

        $this->postJson('/api/auth/forgot-password', ['email' => 'nessuno@example.test'])
            ->assertAccepted()
            ->assertExactJson(self::SENT);

        Mail::assertNothingQueued();
        $this->assertDatabaseCount('password_reset_tokens', 0);
    }

    public function test_invited_and_disabled_users_get_the_same_response_and_no_email(): void
    {
        Mail::fake();
        $invited = User::factory()->invited()->create();
        $disabled = User::factory()->disabled()->create();

        foreach ([$invited, $disabled] as $user) {
            $this->postJson('/api/auth/forgot-password', ['email' => $user->email])
                ->assertAccepted()
                ->assertExactJson(self::SENT);
        }

        Mail::assertNothingQueued();
        $this->assertDatabaseCount('password_reset_tokens', 0);
    }

    public function test_an_infrastructure_error_gets_the_same_response(): void
    {
        Exceptions::fake();
        FailingMailFake::install(ResetPasswordMail::class);
        $user = User::factory()->create();

        // Un 500 solo per le email registrate rivelerebbe quali account esistono
        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])
            ->assertAccepted()
            ->assertExactJson(self::SENT);

        Exceptions::assertReported(RuntimeException::class);
    }

    public function test_email_with_spaces_and_capitals_is_accepted(): void
    {
        Mail::fake();
        $user = User::factory()->create(['email' => 'giulia.rossi@example.test']);

        $this->postJson('/api/auth/forgot-password', ['email' => '  Giulia.Rossi@Example.TEST '])->assertAccepted();

        Mail::assertQueued(ResetPasswordMail::class, fn (ResetPasswordMail $mail): bool => $mail->hasTo($user->email));
    }

    public function test_a_malformed_email_is_rejected(): void
    {
        $this->postJson('/api/auth/forgot-password', ['email' => 'giulia'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');

        $this->postJson('/api/auth/forgot-password', ['email' => ['a@b.test']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('email');
    }

    public function test_a_second_request_within_a_minute_sends_no_new_email(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])->assertAccepted();
        $this->postJson('/api/auth/forgot-password', ['email' => $user->email])
            ->assertAccepted()
            ->assertExactJson(self::SENT);

        Mail::assertQueued(ResetPasswordMail::class, 1);
    }

    public function test_requests_are_limited_to_three_every_fifteen_minutes_per_email(): void
    {
        Mail::fake();

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->postJson('/api/auth/forgot-password', ['email' => 'giulia@example.test'])->assertAccepted();
        }

        $this->postJson('/api/auth/forgot-password', ['email' => 'giulia@example.test'])
            ->assertTooManyRequests()
            ->assertHeader('Retry-After');
        // Il limite è per email + IP: un'altra email dallo stesso IP passa
        $this->postJson('/api/auth/forgot-password', ['email' => 'marco@example.test'])->assertAccepted();

        $this->travel(15)->minutes();
        $this->postJson('/api/auth/forgot-password', ['email' => 'giulia@example.test'])->assertAccepted();
    }

    public function test_accented_variants_of_the_email_share_the_same_limit(): void
    {
        Mail::fake();

        for ($attempt = 0; $attempt < 3; $attempt++) {
            $this->postJson('/api/auth/forgot-password', ['email' => 'giulia@example.test'])->assertAccepted();
        }

        // Il database confronta le email senza accenti: la variante è lo stesso account e non apre un nuovo limite
        $this->postJson('/api/auth/forgot-password', ['email' => 'gíulia@example.test'])->assertTooManyRequests();
    }

    public function test_an_account_receives_at_most_five_links_per_hour_from_any_ip(): void
    {
        Mail::fake();
        $user = User::factory()->create();

        for ($attempt = 1; $attempt <= 6; $attempt++) {
            // IP sempre diverso e oltre i 60 s del broker: solo il tetto per account può fermare l'invio
            $this->withServerVariables(['REMOTE_ADDR' => "203.0.113.{$attempt}"])
                ->postJson('/api/auth/forgot-password', ['email' => $user->email])
                ->assertAccepted()
                ->assertExactJson(self::SENT);
            $this->travel(61)->seconds();
        }

        Mail::assertQueued(ResetPasswordMail::class, 5);

        $this->travel(1)->hours();
        $this->withServerVariables(['REMOTE_ADDR' => '203.0.113.7'])
            ->postJson('/api/auth/forgot-password', ['email' => $user->email])
            ->assertAccepted();
        Mail::assertQueued(ResetPasswordMail::class, 6);
    }

    public function test_requests_are_limited_per_ip_even_with_different_emails(): void
    {
        Mail::fake();

        for ($attempt = 1; $attempt <= 20; $attempt++) {
            $this->postJson('/api/auth/forgot-password', ['email' => "utente{$attempt}@example.test"])->assertAccepted();
        }

        $this->postJson('/api/auth/forgot-password', ['email' => 'altro@example.test'])
            ->assertTooManyRequests();
    }
}
