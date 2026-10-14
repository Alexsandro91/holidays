<?php

namespace App\Http\Middleware;

use App\Support\AuthSession;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Un account disattivato perde l'accesso alla richiesta successiva, anche con una sessione aperta.
 */
final class EnsureUserIsActive
{
    public function handle(Request $request, Closure $next): Response
    {
        if (AuthSession::userIsDisabled($request)) {
            return AuthSession::disabledResponse($request);
        }

        return $next($request);
    }
}
