<?php

namespace App\Models;

use App\Enums\AuthEventType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Evento di sicurezza. Serve solo alla sicurezza (art. 32 GDPR), mai al controllo dell'attività lavorativa.
 */
#[Fillable(['user_id', 'actor_id', 'event', 'ip_address', 'user_agent'])]
class AuthEvent extends Model
{
    use MassPrunable;

    public const UPDATED_AT = null;

    /**
     * Eventi più vecchi del periodo di conservazione (`auth.events_retention_days`, 180 giorni di default).
     *
     * @return Builder<static>
     */
    public function prunable(): Builder
    {
        return static::query()->where('created_at', '<', now()->subDays((int) config('auth.events_retention_days')));
    }

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

    /**
     * @return BelongsTo<User, $this>
     */
    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
