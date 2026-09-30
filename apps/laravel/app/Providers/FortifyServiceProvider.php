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
    public function boot(): void
    {
        RateLimiter::for('login', function (Request $request): array {
            // Input non stringa (es. email[]=…) trattato come vuoto: niente errori di conversione
            $rawEmail = $request->input('email');
            $email = is_string($rawEmail) ? Str::lower(trim($rawEmail)) : '';

            return [
                Limit::perMinute(5)->by('login:'.$email.'|'.$request->ip()),
                Limit::perMinute(20)->by('login-ip:'.$request->ip()),
            ];
        });

        // Il limite ai tentativi lo applica il middleware throttle:login sulla rotta
        Fortify::authenticateThrough(fn (Request $request): array => [
            CanonicalizeUsername::class,
            StartEmailLoginChallenge::class,
        ]);
    }
}
