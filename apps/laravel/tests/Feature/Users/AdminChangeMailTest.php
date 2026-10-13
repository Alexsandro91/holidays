<?php

namespace Tests\Feature\Users;

use App\Enums\AdminChange;
use App\Mail\AdminChangeMail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminChangeMailTest extends TestCase
{
    use RefreshDatabase;

    public function test_says_who_did_what_to_whom_and_what_to_do_if_unexpected(): void
    {
        app()->setLocale('en');

        $mail = new AdminChangeMail(AdminChange::Granted, 'Anna Admin', 'Marco Bianchi', now());

        $mail->assertHasSubject('Holidays: admin rights granted');
        $mail->assertSeeInText('Anna Admin');
        $mail->assertSeeInText('Marco Bianchi');
        $mail->assertSeeInText('If this was not expected');
    }
}
