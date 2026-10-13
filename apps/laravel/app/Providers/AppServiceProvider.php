<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
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

        // Il listener LogPwnedPasswordsRequest è registrato dall'auto-discovery degli eventi di Laravel
    }
}
