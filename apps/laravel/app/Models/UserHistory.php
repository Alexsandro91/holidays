<?php

namespace App\Models;

use App\Enums\UserHistoryEvent;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Una tappa dello storico (spec §8.2). La scrive solo `UserHistoryRecorder`, con `forceFill`.
 *
 * @property UserHistoryEvent $event
 * @property array{role?: string, employment_type?: string, location_id?: int}|null $context
 * @property CarbonImmutable $created_at
 */
class UserHistory extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'user_history';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'event' => UserHistoryEvent::class,
            'context' => 'array',
            'created_at' => 'immutable_datetime',
        ];
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
