<?php

namespace App\Http\Resources;

use App\Models\Location;
use App\Support\AuthSession;
use Illuminate\Http\Request;

/**
 * Utente della richiesta con le durate della sua sessione (`meta.session`), per l'avviso di scadenza del client,
 * e se ci sono più sedi attive (`meta.multiple_locations`).
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
                // Con una sola sede attiva la SPA nasconde colonne, filtri e campi Sede (spec §5.5): una query per risposta
                'multiple_locations' => Location::query()->active()->count() > 1,
            ],
        ];
    }
}
