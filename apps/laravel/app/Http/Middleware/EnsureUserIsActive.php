<?php

namespace App\Http\Middleware;

use App\Enums\AuthErrorReason;
use App\Support\AuthSession;
use App\Support\Translate;
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
            AuthSession::end($request);

            return response()->json([
                'message' => Translate::text('login.session_ended'),
                'meta' => ['reason' => AuthErrorReason::AccountDisabled->value],
            ], Response::HTTP_UNAUTHORIZED);
        }

        return $next($request);
    }
}
