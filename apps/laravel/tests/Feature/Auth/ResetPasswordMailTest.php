<?php

namespace Tests\Feature\Auth;

use App\Mail\ResetPasswordMail;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class ResetPasswordMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_link_points_to_the_spa_with_the_encoded_email(): void
    {
        config(['app.frontend_url' => 'http://localhost:5174/']);

        $mail = new ResetPasswordMail('giulia+hr@example.test', 'abc123');

        // "+" codificato: in una query string non codificata diventerebbe uno spazio
        $this->assertSame('http://localhost:5174/reset-password/abc123?email=giulia%2Bhr%40example.test', $mail->url());
    }

    public function test_contains_the_link_and_the_expiry(): void
    {
        app()->setLocale('en');
        config(['app.frontend_url' => 'http://localhost:5174']);

        $mail = new ResetPasswordMail('giulia@example.test', 'abc123');

        $mail->assertHasSubject('Reset your Holidays password');
        $mail->assertSeeInText('http://localhost:5174/reset-password/abc123?email=giulia%40example.test');
        $mail->assertSeeInText('60 minutes');
    }

    public function test_is_queued_in_the_recipient_language(): void
    {
        Mail::fake();
        $user = User::factory()->create(['locale' => 'en']);

        $user->sendPasswordResetNotification('abc123');

        Mail::assertQueued(ResetPasswordMail::class, fn (ResetPasswordMail $mail): bool => $mail->locale === 'en' && $mail->token === 'abc123');
    }

    public function test_is_encrypted_in_the_queue(): void
    {
        // Il token del link non deve finire in chiaro in jobs/failed_jobs
        $this->assertInstanceOf(ShouldBeEncrypted::class, new ResetPasswordMail('giulia@example.test', 'abc123'));
    }
}
