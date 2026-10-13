<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Contracts\Validation\UncompromisedVerifier;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\NotPwnedVerifier;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    private const HIBP_TIMEOUT_SECONDS = 5;

    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Controllo HIBP con 5 s di timeout invece dei 30 di Laravel: se il servizio è lento il reset non resta appeso.
        // extend() e non singleton(): il provider della validazione è differito e sovrascriverebbe il binding
        $this->app->extend(
            UncompromisedVerifier::class,
            fn (UncompromisedVerifier $verifier, Application $app): NotPwnedVerifier => new NotPwnedVerifier($app->make(HttpFactory::class), self::HIBP_TIMEOUT_SECONDS),
        );
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Regole password (spec §8.2): almeno 12 caratteri, nessun obbligo di simboli, mai una password trafugata
        Password::defaults(function (): Password {
            $rule = Password::min(12);

            return config('auth.password_uncompromised') ? $rule->uncompromised() : $rule;
        });

        // Per utente quando c'è una sessione, per IP da ospite
        RateLimiter::for('api', fn (Request $request): Limit => Limit::perMinute(60)
            ->by('api:'.($request->user()?->getAuthIdentifier() ?? $request->ip())));

        // Il listener LogPwnedPasswordsRequest è registrato dall'auto-discovery degli eventi di Laravel
    }
}
