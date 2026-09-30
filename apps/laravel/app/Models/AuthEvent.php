<?php

namespace App\Models;

use App\Enums\AuthEventType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Evento di sicurezza. Serve solo alla sicurezza (art. 32 GDPR), mai al controllo dell'attività lavorativa.
 */
#[Fillable(['user_id', 'event', 'ip_address', 'user_agent'])]
class AuthEvent extends Model
{
    public const UPDATED_AT = null;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['event' => AuthEventType::class];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
