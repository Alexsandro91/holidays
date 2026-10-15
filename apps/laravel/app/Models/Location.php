<?php

namespace App\Models;

use Database\Factories\LocationFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Sede dell'azienda (spec §2.1): festivi del suo paese, patrono, chiusure e orario standard. Ce n'è sempre una e una
 * sola principale; le sedi non si cancellano, si archiviano.
 *
 * `primary_marker` e `archived_at` si impostano solo nei servizi con `forceFill`.
 */
#[Fillable(['name', 'city', 'patron_day', 'patron_month'])]
class Location extends Model
{
    /** @use HasFactory<LocationFactory> */
    use HasFactory;

    public const DEFAULT_COUNTRY = 'IT';

    public const DEFAULT_TIMEZONE = 'Europe/Rome';

    public const NAME_MAX_LENGTH = 100;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'patron_day' => 'integer',
            'patron_month' => 'integer',
            'primary_marker' => 'integer',
            'archived_at' => 'datetime',
        ];
    }

    /**
     * La sede principale: esiste sempre (la crea la migration, il servizio non la archivia mai).
     */
    public static function primary(): self
    {
        return self::query()->where('primary_marker', 1)->firstOrFail();
    }

    public function isPrimary(): bool
    {
        return $this->primary_marker === 1;
    }

    public function isArchived(): bool
    {
        return $this->archived_at !== null;
    }

    public function hasPatron(): bool
    {
        return $this->patron_day !== null && $this->patron_month !== null;
    }

    /**
     * Sedi assegnabili: non archiviate.
     *
     * @param  Builder<self>  $query
     */
    public function scopeActive(Builder $query): void
    {
        $query->whereNull('archived_at');
    }

    /**
     * @return HasMany<User, $this>
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    /**
     * Versioni dell'orario standard della sede.
     *
     * @return HasMany<WorkSchedule, $this>
     */
    public function schedules(): HasMany
    {
        return $this->hasMany(WorkSchedule::class);
    }
}
