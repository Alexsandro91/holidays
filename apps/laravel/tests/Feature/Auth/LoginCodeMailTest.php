<?php

namespace Tests\Feature\Auth;

use App\Mail\LoginCodeMail;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class LoginCodeMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_contains_the_code_and_the_device(): void
    {
        app()->setLocale('en');

        $mail = new LoginCodeMail('482913', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', now());

        $mail->assertHasSubject('Your Holidays sign-in code');
        $mail->assertSeeInHtml('482913');
        $mail->assertSeeInText('Chrome on macOS');
    }

    public function test_is_queued_in_the_recipient_language(): void
    {
        Mail::fake();
        $user = User::factory()->create(['locale' => 'en']);

        Mail::to($user)->send(new LoginCodeMail('123456', '', now()));

        Mail::assertQueued(LoginCodeMail::class, fn (LoginCodeMail $mail): bool => $mail->locale === 'en');
    }

    public function test_is_encrypted_in_the_queue(): void
    {
        // Il codice non deve finire in chiaro in jobs/failed_jobs
        $this->assertInstanceOf(ShouldBeEncrypted::class, new LoginCodeMail('123456', '', now()));
    }
}
