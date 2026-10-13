<?php

namespace App\Services;

use App\Enums\UserStatus;
use Illuminate\Contracts\Auth\PasswordBroker;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Timebox;

/**
 * Recupero password con il broker di Laravel: link solo agli utenti attivi, nessun indizio sull'esistenza dell'email.
 */
final class PasswordResetService
{
    /** Durata minima della richiesta del link: uguale con e senza invio (hash del token, scrittura in coda). */
    private const MIN_LINK_DURATION_MICROSECONDS = 400_000;

    /**
     * Invia il link se l'email è di un utente attivo. Negli altri casi non succede nulla, con gli stessi tempi.
     */
    public function sendLink(string $email): void
    {
        (new Timebox)->call(function () use ($email): void {
            // Esito ignorato di proposito: utente inesistente, non attivo o link già chiesto da meno di 60 s
            $this->broker()->sendResetLink(['email' => $email, 'status' => UserStatus::Active->value]);
        }, self::MIN_LINK_DURATION_MICROSECONDS);
    }

    private function broker(): PasswordBroker
    {
        return Password::broker((string) config('fortify.passwords'));
    }
}
