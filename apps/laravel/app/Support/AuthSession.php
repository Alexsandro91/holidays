<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Chiavi di sessione del flusso di accesso.
 */
final class AuthSession
{
    /** ID della challenge in attesa del codice (tra password e codice). */
    public const CHALLENGE_ID = 'login.challenge_id';

    /** Timestamp Unix del login completato, per la scadenza assoluta. */
    public const LOGGED_IN_AT = 'auth.logged_in_at';

    /**
     * Chiude la sessione corrente: logout, sessione invalidata e nuovo token CSRF.
     */
    public static function end(Request $request): void
    {
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
    }
}
