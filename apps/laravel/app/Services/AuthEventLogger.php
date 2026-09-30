<?php

namespace App\Services;

use App\Enums\AuthEventType;
use App\Models\AuthEvent;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class AuthEventLogger
{
    public function log(AuthEventType $type, Request $request, ?User $user = null): void
    {
        AuthEvent::query()->create([
            'user_id' => $user?->id,
            'event' => $type,
            'ip_address' => $request->ip(),
            'user_agent' => Str::limit((string) $request->userAgent(), 255, ''),
        ]);
    }
}
