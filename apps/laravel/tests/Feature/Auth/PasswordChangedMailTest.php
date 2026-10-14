<?php

namespace Tests\Feature\Auth;

use App\Mail\PasswordChangedMail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PasswordChangedMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_tells_when_and_from_where_the_password_was_changed(): void
    {
        app()->setLocale('en');

        $mail = new PasswordChangedMail('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', now());

        $mail->assertHasSubject('Your Holidays password was changed');
        $mail->assertSeeInText('Chrome on macOS');
        $mail->assertSeeInText('signed out every other open session');
    }
}
