<?php

namespace App\Http\Middleware;

use App\Enums\AuthErrorReason;
use App\Support\AuthSession;
use App\Support\Translate;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Scadenza assoluta della sessione (12 ore dal login), indipendente dall'attività.
 */
final class EnforceAbsoluteSessionLifetime
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user() !== null && $request->hasSession()) {
            if (! is_int($request->session()->get(AuthSession::LOGGED_IN_AT))) {
                // Sessione senza timestamp (creata prima di questa regola o nei test): il conteggio parte ora
                $request->session()->put(AuthSession::LOGGED_IN_AT, now()->getTimestamp());
            } elseif (AuthSession::isPastAbsoluteLifetime($request)) {
                AuthSession::end($request);

                return response()->json([
                    'message' => Translate::text('login.session_expired'),
                    'meta' => ['reason' => AuthErrorReason::SessionExpired->value],
                ], Response::HTTP_UNAUTHORIZED);
            }
        }

        return $next($request);
    }
}
