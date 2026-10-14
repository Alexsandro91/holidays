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

    public function test_tells_who_invited_a_new_admin_in_both_languages(): void
    {
        app()->setLocale('en');
        $mail = new AdminChangeMail(AdminChange::Invited, 'Anna Admin', 'Nora Neri', now());
        $mail->assertHasSubject('Holidays: new admin invited');
        $mail->assertSeeInText('Anna Admin invited Nora Neri as an admin');

        app()->setLocale('it');
        $mail = new AdminChangeMail(AdminChange::Invited, 'Anna Admin', 'Nora Neri', now());
        $mail->assertHasSubject('Holidays: nuovo amministratore invitato');
        $mail->assertSeeInText('Anna Admin ha invitato Nora Neri come amministratore');
    }

    public function test_tells_who_changed_the_email_of_an_invited_admin(): void
    {
        app()->setLocale('it');
        $mail = new AdminChangeMail(AdminChange::EmailChanged, 'Anna Admin', 'Nora Neri', now());

        $mail->assertHasSubject('Holidays: email di un amministratore invitato modificata');
        $mail->assertSeeInText('Anna Admin ha cambiato l’email dell’amministratore invitato Nora Neri');

        app()->setLocale('en');
        $mail = new AdminChangeMail(AdminChange::EmailChanged, 'Anna Admin', 'Nora Neri', now());
        $mail->assertHasSubject('Holidays: email of an invited admin changed');
        $mail->assertSeeInText('Anna Admin changed the email of the invited admin Nora Neri');
    }
}
