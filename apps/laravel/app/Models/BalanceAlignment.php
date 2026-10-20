<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Un allineamento alla busta paga (spec §5.2), anche quello senza differenze: serve a ricordare l'ultima data
 * allineata. Lo scrive solo `BalanceCorrectionService`, con `forceFill`.
 *
 * @property int $user_id
 * @property CarbonImmutable $aligned_on
 * @property int|null $actor_id
 */
class BalanceAlignment extends Model
{
    public const UPDATED_AT = null;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'aligned_on' => 'immutable_date',
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
