<?php

namespace App\Services;

use App\Enums\AuthEventType;
use App\Models\AuthEvent;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class AuthEventLogger
{
    /**
     * @param  list<string>|null  $changedFields  nomi dei campi cambiati (mai i valori), per `user_updated`
     */
    public function log(AuthEventType $type, Request $request, ?User $user = null, ?User $actor = null, ?array $changedFields = null): void
    {
        // IP e user agent sono di chi fa la richiesta: se c'è actor_id appartengono all'autore, non a user_id
        AuthEvent::query()->create([
            'user_id' => $user?->id,
            'actor_id' => $actor?->id,
            'event' => $type,
            'changed_fields' => $changedFields,
            'ip_address' => $request->ip(),
            'user_agent' => Str::limit((string) $request->userAgent(), 255, ''),
        ]);
    }
}
