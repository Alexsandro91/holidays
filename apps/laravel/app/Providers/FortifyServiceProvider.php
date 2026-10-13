<?php

namespace App\Providers;

use App\Actions\Fortify\StartEmailLoginChallenge;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Laravel\Fortify\Actions\CanonicalizeUsername;
use Laravel\Fortify\Fortify;

class FortifyServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Rotte registrate a mano in routes/web.php: solo quelle usate dalla SPA, ognuna col suo limite
        Fortify::ignoreRoutes();
    }

    public function boot(): void
    {
        RateLimiter::for('login', fn (Request $request): array => [
            Limit::perMinute(5)->by('login:'.self::normalizedEmail($request).'|'.$request->ip()),
            Limit::perMinute(20)->by('login-ip:'.$request->ip()),
        ]);

        // Richiesta del link di recupero: 3 ogni 15 minuti per email + IP, più un tetto largo per IP
        // (l'ufficio condivide un solo IP pubblico) contro invii a tappeto variando l'email
        RateLimiter::for('forgot-password', fn (Request $request): array => [
            Limit::perMinutes(15, 3)->by('forgot-password:'.self::normalizedEmail($request).'|'.$request->ip()),
            Limit::perMinutes(15, 20)->by('forgot-password-ip:'.$request->ip()),
        ]);

        // Nuova password dal link: 10 richieste al minuto per IP
        RateLimiter::for('reset-password', fn (Request $request): Limit => Limit::perMinute(10)->by('reset-password:'.$request->ip()));

        // Endpoint del codice: 10 richieste al minuto per IP
        RateLimiter::for('two-factor', fn (Request $request): Limit => Limit::perMinute(10)->by('two-factor:'.$request->ip()));

        // Il limite ai tentativi lo applica il middleware throttle:login sulla rotta
        Fortify::authenticateThrough(fn (Request $request): array => [
            CanonicalizeUsername::class,
            StartEmailLoginChallenge::class,
        ]);
    }

    /**
     * Email per le chiavi dei limiti. Input non stringa (es. email[]=…) trattato come vuoto: niente errori di conversione.
     */
    private static function normalizedEmail(Request $request): string
    {
        $email = $request->input('email');

        return is_string($email) ? Str::lower(trim($email)) : '';
    }
}
