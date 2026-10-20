<?php

namespace App\Models;

use App\Enums\DayHalf;
use App\Enums\LeaveRequestStatus;
use App\Enums\LeaveSource;
use App\Enums\LeaveUnit;
use Carbon\CarbonImmutable;
use Database\Factories\LeaveRequestFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Richiesta di assenza (fase 3, spec §3.1). Tutte le colonne si scrivono solo nei servizi con `forceFill`.
 *
 * @property int $user_id
 * @property int $absence_type_id
 * @property int $location_id
 * @property LeaveUnit $unit
 * @property CarbonImmutable $starts_on
 * @property CarbonImmutable $ends_on
 * @property DayHalf|null $half
 * @property string|null $starts_at
 * @property string|null $ends_at
 * @property int $minutes
 * @property string $working_days
 * @property LeaveRequestStatus $status
 * @property string|null $note
 * @property string|null $decision_note
 * @property int|null $decided_by
 * @property CarbonImmutable|null $decided_at
 * @property CarbonImmutable|null $cancellation_requested_at
 * @property int|null $cancelled_by
 * @property CarbonImmutable|null $cancelled_at
 * @property LeaveSource $source
 * @property int|null $closure_id
 * @property list<array{code: string, params: array<string, int|float|string>}> $warnings Avvisi del calcolo, non persistiti
 */
class LeaveRequest extends Model
{
    /** @use HasFactory<LeaveRequestFactory> */
    use HasFactory;

    public const NOTE_MAX_LENGTH = 500;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'unit' => LeaveUnit::class,
            'starts_on' => 'immutable_date',
            'ends_on' => 'immutable_date',
            'half' => DayHalf::class,
            'minutes' => 'integer',
            'working_days' => 'decimal:2',
            'status' => LeaveRequestStatus::class,
            'decided_at' => 'immutable_datetime',
            'cancellation_requested_at' => 'immutable_datetime',
            'cancelled_at' => 'immutable_datetime',
            'source' => LeaveSource::class,
        ];
    }

    /**
     * `starts_at` e `ends_at` sono colonne `time`: si leggono come `H:i`.
     */
    protected function getStartsAtAttribute(?string $value): ?string
    {
        return $value === null ? null : substr($value, 0, 5);
    }

    protected function getEndsAtAttribute(?string $value): ?string
    {
        return $value === null ? null : substr($value, 0, 5);
    }

    /**
     * @param  Builder<LeaveRequest>  $query
     */
    public function scopeActive(Builder $query): void
    {
        $query->whereIn('status', array_map(
            fn (LeaveRequestStatus $status): string => $status->value,
            array_filter(LeaveRequestStatus::cases(), fn (LeaveRequestStatus $status): bool => $status->isActive()),
        ));
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * @return BelongsTo<AbsenceType, $this>
     */
    public function absenceType(): BelongsTo
    {
        return $this->belongsTo(AbsenceType::class);
    }

    /**
     * @return BelongsTo<Location, $this>
     */
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    /**
     * @return HasMany<LeaveRequestDay, $this>
     */
    public function days(): HasMany
    {
        return $this->hasMany(LeaveRequestDay::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function canceller(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    /**
     * @return HasMany<BalanceMovement, $this>
     */
    public function movements(): HasMany
    {
        return $this->hasMany(BalanceMovement::class);
    }
}
