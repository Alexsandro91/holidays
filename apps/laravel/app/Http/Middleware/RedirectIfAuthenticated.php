<?php

namespace App\Http\Middleware;

use App\Enums\AuthErrorReason;
use App\Support\AuthSession;
use App\Support\Translate;
use Closure;
use Illuminate\Auth\Middleware\RedirectIfAuthenticated as BaseRedirectIfAuthenticated;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware `guest`: chi ha già una sessione non usa login, recupero password, codice e inviti.
 * Le chiamate API ricevono un 409 JSON col motivo al posto del redirect, che un client JSON non saprebbe seguire.
 * Una sessione non più valida (account disattivato o scaduta) non blocca: viene chiusa e la richiesta passa.
 */
final class RedirectIfAuthenticated extends BaseRedirectIfAuthenticated
{
    public function handle(Request $request, Closure $next, string ...$guards): Response
    {
        // Sessione che le rotte API chiuderebbero comunque (account disattivato o oltre la durata assoluta):
        // si chiude qui e la richiesta prosegue come quella di un ospite, così si può rifare l'accesso
        if ($request->user() !== null && (AuthSession::userIsDisabled($request) || AuthSession::isPastAbsoluteLifetime($request))) {
            AuthSession::end($request);

            return $next($request);
        }

        if (! $request->expectsJson() && ! $request->is('api/*')) {
            return parent::handle($request, $next, ...$guards);
        }

        foreach ($guards === [] ? [null] : $guards as $guard) {
            if (Auth::guard($guard)->check()) {
                return response()->json([
                    'message' => Translate::text('login.already_authenticated'),
                    'meta' => ['reason' => AuthErrorReason::AlreadyAuthenticated->value],
                ], Response::HTTP_CONFLICT);
            }
        }

        return $next($request);
    }
}
