<?php

namespace App\Models;

use App\Enums\AbsenceDayCount;
use App\Enums\AbsenceLimitPeriod;
use App\Enums\AbsenceLimitUnit;
use App\Enums\BalanceType;
use App\Enums\EmploymentType;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Database\Factories\AbsenceTypeFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Tipo di assenza (spec §3.1): cosa si può chiedere, da quale saldo scala, a chi vale. Si archivia e non si cancella.
 * I tipi di partenza hanno un `code` e, finché non vengono rinominati, un nome tradotto.
 *
 * Tutte le colonne si impostano solo nei servizi con `forceFill`.
 *
 * @property string|null $code
 * @property string|null $name
 * @property bool $allows_days
 * @property bool $allows_half_days
 * @property bool $allows_hours
 * @property BalanceType|null $balance
 * @property bool $requires_approval
 * @property list<string> $employment_types
 * @property bool $requires_enablement
 * @property AbsenceDayCount $day_count
 * @property bool $requires_certificate
 * @property int|null $limit_amount
 * @property AbsenceLimitUnit|null $limit_unit
 * @property AbsenceLimitPeriod|null $limit_period
 * @property int $position
 * @property CarbonImmutable|null $archived_at
 */
class AbsenceType extends Model
{
    /** @use HasFactory<AbsenceTypeFactory> */
    use HasFactory;

    public const NAME_MAX_LENGTH = 100;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'allows_days' => 'boolean',
            'allows_half_days' => 'boolean',
            'allows_hours' => 'boolean',
            'balance' => BalanceType::class,
            'requires_approval' => 'boolean',
            'employment_types' => 'array',
            'requires_enablement' => 'boolean',
            'day_count' => AbsenceDayCount::class,
            'requires_certificate' => 'boolean',
            'limit_amount' => 'integer',
            'limit_unit' => AbsenceLimitUnit::class,
            'limit_period' => AbsenceLimitPeriod::class,
            'position' => 'integer',
            'archived_at' => 'immutable_datetime',
        ];
    }

    /**
     * I tipi di partenza hanno un codice, quelli dell'admin no.
     */
    public function isSystem(): bool
    {
        return $this->code !== null;
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    /**
     * Nome scritto dall'admin, altrimenti quello tradotto del tipo di partenza.
     */
    public function displayName(): string
    {
        if ($this->name !== null) {
            return $this->name;
        }

        return Translate::text("absence_types.names.{$this->code}");
    }

    public function appliesTo(EmploymentType $type): bool
    {
        return in_array($type->value, $this->employment_types, true);
    }

    /**
     * Tipi richiedibili: non archiviati.
     *
     * @param  Builder<self>  $query
     */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    /**
     * @param  Builder<self>  $query
     */
    public function scopeOrdered(Builder $query): void
    {
        $query->orderBy('position')->orderBy('id');
    }

    /**
     * Persone abilitate (solo per i tipi con `requires_enablement`).
     *
     * @return BelongsToMany<User, $this>
     */
    public function enabledUsers(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'absence_type_user')->withPivot(['actor_id', 'created_at']);
    }
}
