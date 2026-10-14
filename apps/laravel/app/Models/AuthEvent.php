<?php

namespace App\Models;

use App\Enums\AuthEventType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Log;

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
     * Con un valore non positivo (es. `AUTH_EVENTS_RETENTION_DAYS=` vuoto, che diventa 0) non si cancella nulla:
     * altrimenti la pulizia notturna svuoterebbe tutto il log di sicurezza.
     *
     * @return Builder<static>
     */
    public function prunable(): Builder
    {
        $configured = config('auth.events_retention_days');
        $days = is_numeric($configured) ? (int) $configured : 0;

        if ($days <= 0) {
            Log::warning('Auth events pruning skipped: retention days must be positive', ['events_retention_days' => $configured]);

            return static::query()->whereKey([]);
        }

        return static::query()->where('created_at', '<', now()->subDays($days));
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
