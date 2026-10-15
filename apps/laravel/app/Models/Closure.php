<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Database\Factories\ClosureFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Chiusura aziendale (spec §2.4): giorni non lavorativi per una sede o, con `location_id` NULL, per tutte.
 * Il nome coincide con `\Closure` di PHP: dove servono entrambi si importa con alias (`CompanyClosure`).
 *
 * @property CarbonImmutable $starts_on
 * @property CarbonImmutable $ends_on
 */
class Closure extends Model
{
    /** @use HasFactory<ClosureFactory> */
    use HasFactory;

    public const MAX_DAYS = 31;

    public const DESCRIPTION_MAX_LENGTH = 100;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'starts_on' => 'immutable_date',
            'ends_on' => 'immutable_date',
        ];
    }

    /**
     * @return BelongsTo<Location, $this>
     */
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }
}
