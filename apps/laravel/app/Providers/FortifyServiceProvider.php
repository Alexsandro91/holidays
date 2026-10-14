<?php

namespace App\Providers;

use App\Actions\Fortify\StartEmailLoginChallenge;
use App\Support\EmailKey;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
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
        // Login: 5 tentativi al minuto per email + IP; il tetto per IP è largo perché l'ufficio
        // esce da un solo IP pubblico e un collega che sbaglia non deve bloccare tutti gli altri
        RateLimiter::for('login', fn (Request $request): array => [
            Limit::perMinute(5)->by('login:'.self::normalizedEmail($request).'|'.$request->ip()),
            Limit::perMinute(100)->by('login-ip:'.$request->ip()),
        ]);

        // Richiesta del link di recupero: 3 ogni 15 minuti per email + IP, più un tetto largo per IP
        // (l'ufficio condivide un solo IP pubblico) contro invii a tappeto variando l'email
        RateLimiter::for('forgot-password', fn (Request $request): array => [
            Limit::perMinutes(15, 3)->by('forgot-password:'.self::normalizedEmail($request).'|'.$request->ip()),
            Limit::perMinutes(15, 100)->by('forgot-password-ip:'.$request->ip()),
        ]);

        // Nuova password dal link: 30 richieste al minuto per IP
        RateLimiter::for('reset-password', fn (Request $request): Limit => Limit::perMinute(30)->by('reset-password:'.$request->ip()));

        // Pagine pubbliche dell'invito: 30 richieste al minuto per IP
        RateLimiter::for('invitations', fn (Request $request): Limit => Limit::perMinute(30)->by('invitations:'.$request->ip()));

        // Endpoint del codice: 60 richieste al minuto per IP (ogni challenge ha comunque i suoi 5 tentativi)
        RateLimiter::for('two-factor', fn (Request $request): Limit => Limit::perMinute(60)->by('two-factor:'.$request->ip()));

        // Il limite ai tentativi lo applica il middleware throttle:login sulla rotta
        Fortify::authenticateThrough(fn (Request $request): array => [
            CanonicalizeUsername::class,
            StartEmailLoginChallenge::class,
        ]);
    }

    private static function normalizedEmail(Request $request): string
    {
        return EmailKey::from($request->input('email'));
    }
}
