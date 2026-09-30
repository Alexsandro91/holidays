<?php

namespace Tests\Concerns;

use App\Mail\LoginCodeMail;
use App\Models\User;
use Illuminate\Support\Facades\Mail;

trait CompletesLogin
{
    /**
     * Invia email e password e restituisce il codice finito nell'email (Mail::fake).
     */
    protected function startLogin(User $user, string $password = 'password'): string
    {
        Mail::fake();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => $password])->assertOk();

        return $this->lastLoginCode();
    }

    /**
     * Codice dell'ultima email di login messa in coda.
     */
    protected function lastLoginCode(): string
    {
        $code = '';

        Mail::assertQueued(LoginCodeMail::class, function (LoginCodeMail $mail) use (&$code): bool {
            $code = $mail->code;

            return true;
        });

        return $code;
    }

    protected function completeLogin(User $user, string $password = 'password'): void
    {
        $code = $this->startLogin($user, $password);

        $this->postJson('/api/auth/two-factor', ['code' => $code])->assertOk();
    }
}
