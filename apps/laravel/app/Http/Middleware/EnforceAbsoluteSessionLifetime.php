<?php

namespace App\Http\Middleware;

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
            $session = $request->session();
            $loggedInAt = $session->get(AuthSession::LOGGED_IN_AT);

            if (! is_int($loggedInAt)) {
                // Sessione senza timestamp (creata prima di questa regola o nei test): il conteggio parte ora
                $session->put(AuthSession::LOGGED_IN_AT, now()->getTimestamp());
            } elseif (now()->getTimestamp() - $loggedInAt > (int) config('session.absolute_lifetime') * 60) {
                AuthSession::end($request);

                return response()->json(['message' => Translate::text('login.session_expired')], Response::HTTP_UNAUTHORIZED);
            }
        }

        return $next($request);
    }
}
