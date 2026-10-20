<?php

namespace App\Models;

use App\Enums\BalanceMovementKind;
use App\Enums\BalanceType;
use Carbon\CarbonImmutable;
use Database\Factories\BalanceMovementFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Movimento di saldo (spec §5): il saldo è sempre la somma dei movimenti. Immutabile, si corregge con un altro
 * movimento. Lo scrivono solo i servizi, con `forceFill`.
 *
 * @property int $user_id
 * @property BalanceType $balance
 * @property BalanceMovementKind $kind
 * @property int $minutes
 * @property CarbonImmutable $effective_on
 * @property string|null $period
 * @property int|null $target_minutes
 * @property string|null $note
 * @property int|null $actor_id
 * @property CarbonImmutable|null $created_at
 */
class BalanceMovement extends Model
{
    /** @use HasFactory<BalanceMovementFactory> */
    use HasFactory;

    public const UPDATED_AT = null;

    public const NOTE_MAX_LENGTH = 255;

    /**
     * Valore massimo, in assoluto, di una rettifica o di un valore di allineamento: 10000 ore.
     */
    public const MAX_CORRECTION_MINUTES = 600000;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'balance' => BalanceType::class,
            'kind' => BalanceMovementKind::class,
            'minutes' => 'integer',
            'effective_on' => 'immutable_date',
            'target_minutes' => 'integer',
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
