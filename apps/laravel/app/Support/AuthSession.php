<?php

namespace App\Support;

/**
 * Chiavi di sessione del flusso di accesso.
 */
final class AuthSession
{
    /** ID della challenge in attesa del codice (tra password e codice). */
    public const CHALLENGE_ID = 'login.challenge_id';

    /** Timestamp Unix del login completato, per la scadenza assoluta. */
    public const LOGGED_IN_AT = 'auth.logged_in_at';
}
