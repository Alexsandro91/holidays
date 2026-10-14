<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

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
     * L'utente della sessione è stato disattivato: la sessione non vale più (EnsureUserIsActive).
     */
    public static function userIsDisabled(Request $request): bool
    {
        $user = $request->user();

        return $user instanceof User && ! $user->isActive();
    }

    /**
     * La sessione ha superato la durata assoluta dal login (EnforceAbsoluteSessionLifetime).
     * Senza timestamp non è scaduta: lo registra il middleware alla prima richiesta API.
     */
    public static function isPastAbsoluteLifetime(Request $request): bool
    {
        if (! $request->hasSession()) {
            return false;
        }

        $loggedInAt = $request->session()->get(self::LOGGED_IN_AT);

        return is_int($loggedInAt)
            && now()->getTimestamp() - $loggedInAt > (int) config('session.absolute_lifetime') * 60;
    }

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

    /**
     * Chiude tutte le sessioni dell'utente su ogni dispositivo (driver `database`, spec §6.4): reset password e disattivazione.
     */
    public static function endAllFor(User $user): void
    {
        DB::table((string) config('session.table', 'sessions'))->where('user_id', $user->getKey())->delete();
    }
}
