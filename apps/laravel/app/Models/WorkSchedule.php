<?php

namespace App\Models;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Database\Factories\WorkScheduleFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Una versione di orario (spec §2.3): standard di una sede (`location_id`) o personale (`user_id`), valida da
 * `valid_from` fino alla versione successiva. Una riga personale con `follows_location` riporta all'orario della sede.
 * Tutti i campi si impostano solo nei servizi con `forceFill`.
 *
 * @property CarbonImmutable $valid_from
 * @property bool $follows_location
 */
class WorkSchedule extends Model
{
    /** @use HasFactory<WorkScheduleFactory> */
    use HasFactory;

    /**
     * Giorni nell'ordine delle colonne `<giorno>_minutes`: lunedì primo, come `dayOfWeekIso`.
     */
    public const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    public const MAX_DAILY_MINUTES = 720;

    public const MINUTE_STEP = 15;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'valid_from' => 'immutable_date',
            'follows_location' => 'boolean',
            ...array_fill_keys(array_map(fn (string $day): string => "{$day}_minutes", self::DAYS), 'integer'),
        ];
    }

    /**
     * Minuti di ogni giorno della settimana, lunedì primo.
     *
     * @return list<int>
     */
    public function minutes(): array
    {
        return array_map(fn (string $day): int => (int) $this->getAttribute("{$day}_minutes"), self::DAYS);
    }

    public function minutesOn(CarbonInterface $date): int
    {
        return $this->minutes()[$date->dayOfWeekIso - 1];
    }

    /**
     * Già in vigore quel giorno: non si modifica né si cancella più (spec §2.3).
     */
    public function isStarted(CarbonInterface $today): bool
    {
        return $this->valid_from->toDateString() <= $today->toDateString();
    }

    /**
     * @return BelongsTo<Location, $this>
     */
    public function location(): BelongsTo
    {
        return $this->belongsTo(Location::class);
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
