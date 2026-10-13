<?php

namespace Tests\Feature\Users;

use App\Mail\InvitationMail;
use Illuminate\Contracts\Queue\ShouldBeEncrypted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class InvitationMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_links_to_the_spa_and_states_the_expiry(): void
    {
        app()->setLocale('en');
        config(['app.frontend_url' => 'http://localhost:5174/']);

        $mail = new InvitationMail('Sara Colombo', 'abc123', 'Anna Admin', now()->addHours(72));

        $this->assertSame('http://localhost:5174/invitation/abc123', $mail->url());
        $mail->assertHasSubject('You’re invited to Holidays');
        $mail->assertSeeInText('http://localhost:5174/invitation/abc123');
        $mail->assertSeeInText('Anna Admin');
        $mail->assertSeeInText('72 hours');
    }

    public function test_is_encrypted_in_the_queue(): void
    {
        // Il token dell'invito non deve finire in chiaro in jobs/failed_jobs
        $this->assertInstanceOf(ShouldBeEncrypted::class, new InvitationMail('Sara', 'abc', null, now()));
    }
}
