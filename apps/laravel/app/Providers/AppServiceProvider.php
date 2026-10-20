<?php

namespace App\Providers;

use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Contracts\Foundation\Application;
use Illuminate\Contracts\Validation\UncompromisedVerifier;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Request;
use Illuminate\Mail\Markdown;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
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

        // Nelle email markdown i valori interpolati (nomi) non diventano link né HTML
        Markdown::withSecuredEncoding();

        // Per utente quando c'è una sessione, per IP da ospite
        RateLimiter::for('api', fn (Request $request): Limit => Limit::perMinute(60)
            ->by('api:'.($request->user()?->getAuthIdentifier() ?? $request->ip())));

        // `{user}` nell'indirizzo: per chi gestisce gli utenti si cerca solo tra le persone che può vedere (spec §4.1),
        // così una persona di un'altra sede è 404 su ogni rotta, presente e futura. `auth:sanctum` gira prima della
        // risoluzione dei parametri (priorità dei middleware di Laravel). Il dipendente riceve il 403 della policy
        Route::bind('user', function (string $value): User {
            $actor = request()->user();
            $query = $actor instanceof User && Gate::forUser($actor)->allows('viewAny', User::class)
                ? User::query()->visibleTo($actor)
                : User::query();

            return $query->findOrFail($value);
        });

        // `{leaveRequest}`: per chi gestisce gli utenti si cerca tra le proprie richieste e quelle delle persone che può
        // vedere, così la richiesta di un'altra sede è 404 come `{user}`. Il dipendente riceve il 403 della policy.
        // `user` caricato: la policy non fa query
        Route::bind('leaveRequest', function (string $value): LeaveRequest {
            $actor = request()->user();
            $query = LeaveRequest::query()->with('user');

            if ($actor instanceof User && Gate::forUser($actor)->allows('viewAny', User::class)) {
                $query->where(fn (Builder $query) => $query
                    ->where('user_id', $actor->id)
                    ->orWhereHas('user', fn (Builder $users) => $users->visibleTo($actor)));
            }

            return $query->findOrFail($value);
        });

        // Il listener LogPwnedPasswordsRequest è registrato dall'auto-discovery degli eventi di Laravel
    }
}
