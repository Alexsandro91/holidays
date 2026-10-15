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
 * @property-read Location|null $location null nelle versioni personali
 * @property-read User|null $user null nelle versioni della sede
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
     * Fuso di chi possiede la versione, per "oggi" in `isStarted()`: la sede, o la sede della persona. I controller
     * impostano le relazioni prima di serializzare, così la resource non fa query.
     */
    public function ownerTimezone(): string
    {
        $location = $this->location_id !== null ? $this->location : $this->user?->location;

        return $location->timezone ?? Location::DEFAULT_TIMEZONE;
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
