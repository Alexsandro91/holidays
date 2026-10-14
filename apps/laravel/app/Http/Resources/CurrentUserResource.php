<?php

namespace App\Http\Resources;

use App\Support\AuthSession;
use Illuminate\Http\Request;

/**
 * Utente della richiesta con le durate della sua sessione (`meta.session`), per l'avviso di scadenza del client.
 */
class CurrentUserResource extends UserResource
{
    /**
     * @return array<string, mixed>
     */
    public function with(Request $request): array
    {
        return [
            'meta' => [
                'session' => [
                    'idle_timeout_seconds' => (int) config('session.lifetime') * 60,
                    'absolute_remaining_seconds' => AuthSession::absoluteRemainingSeconds($request),
                ],
            ],
        ];
    }
}
