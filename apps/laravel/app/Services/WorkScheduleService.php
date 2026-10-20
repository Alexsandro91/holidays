<?php

namespace App\Services;

use App\Models\Location;
use App\Models\User;
use App\Models\WorkSchedule;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/**
 * Versioni dell'orario (spec §2.3): una nuova vale da oggi o da una data futura, nel fuso della sede; quelle già
 * iniziate non si toccano, quelle future si cancellano.
 */
final class WorkScheduleService
{
    /**
     * Orario di partenza se la principale non ne ha: lunedì-venerdì, 8 ore.
     *
     * @var list<int>
     */
    public const DEFAULT_MINUTES = [480, 480, 480, 480, 480, 0, 0];

    /**
     * "Oggi" sempre nel fuso della sede, mai in UTC.
     */
    public function today(Location $location): CarbonImmutable
    {
        return CarbonImmutable::now($location->timezone)->startOfDay();
    }

    /**
     * Versione in vigore quel giorno (oggi se non indicato); prima della prima versione vale la prima.
     */
    public function currentForLocation(Location $location, ?CarbonImmutable $day = null): ?WorkSchedule
    {
        $day ??= $this->today($location);

        return $location->schedules()->where('valid_from', '<=', $day->toDateString())->orderByDesc('valid_from')->first()
            ?? $location->schedules()->orderBy('valid_from')->first();
    }

    /**
     * Versione che vale per la persona quel giorno: la sua personale, se c'è e non riporta alla sede, altrimenti quella
     * della sede (stessa scelta di `WorkCalendar`).
     */
    public function currentForUser(User $user, Location $location, CarbonImmutable $day): ?WorkSchedule
    {
        $own = $user->schedules()->where('valid_from', '<=', $day->toDateString())->orderByDesc('valid_from')->first();

        if ($own !== null && ! $own->follows_location) {
            return $own;
        }

        return $this->currentForLocation($location, $day);
    }

    /**
     * @param  list<int>  $minutes  sette valori, lunedì primo
     */
    public function addForLocation(Location $location, CarbonImmutable $validFrom, array $minutes, User $actor): WorkSchedule
    {
        $schedule = DB::transaction(function () use ($location, $validFrom, $minutes): WorkSchedule {
            // Blocca la sede: due versioni nuove in parallelo non scelgono la stessa data
            $locked = Location::query()->lockForUpdate()->findOrFail($location->id);
            $this->ensureValidFrom($validFrom, $this->today($locked), $locked->schedules()->where('valid_from', $validFrom->toDateString())->exists());

            return $this->createForLocation($locked, $validFrom, $minutes);
        });

        Log::info('Location schedule added', ['location_id' => $location->id, 'schedule_id' => $schedule->id, 'valid_from' => $validFrom->toDateString(), 'actor_id' => $actor->id]);

        return $schedule;
    }

    /**
     * Senza i controlli sulla data: per l'orario iniziale di una sede appena creata.
     *
     * @param  list<int>  $minutes
     */
    public function createForLocation(Location $location, CarbonImmutable $validFrom, array $minutes): WorkSchedule
    {
        $schedule = new WorkSchedule;
        $schedule->forceFill([
            'location_id' => $location->id,
            'user_id' => null,
            'valid_from' => $validFrom->toDateString(),
            'follows_location' => false,
            ...$this->minuteColumns($minutes),
        ])->save();

        return $schedule;
    }

    /**
     * Versione personale (spec §4.4). Con `$minutes` null la persona torna all'orario della sede da quel giorno.
     *
     * @param  list<int>|null  $minutes
     */
    public function addForUser(User $user, CarbonImmutable $validFrom, ?array $minutes, User $actor): WorkSchedule
    {
        $schedule = DB::transaction(function () use ($user, $validFrom, $minutes): WorkSchedule {
            // Blocca la persona: due versioni nuove in parallelo non scelgono la stessa data
            $locked = User::query()->lockForUpdate()->findOrFail($user->id);
            $location = Location::query()->findOrFail($locked->location_id);
            $this->ensureValidFrom($validFrom, $this->today($location), $locked->schedules()->where('valid_from', $validFrom->toDateString())->exists());

            $schedule = new WorkSchedule;
            $schedule->forceFill([
                'location_id' => null,
                'user_id' => $locked->id,
                'valid_from' => $validFrom->toDateString(),
                'follows_location' => $minutes === null,
                ...($minutes === null ? $this->restColumns() : $this->minuteColumns($minutes)),
            ])->save();

            return $schedule;
        });

        Log::info('Personal schedule added', [
            'user_id' => $user->id,
            'schedule_id' => $schedule->id,
            'valid_from' => $validFrom->toDateString(),
            'follows_location' => $minutes === null,
            'actor_id' => $actor->id,
        ]);

        return $schedule;
    }

    /**
     * Solo le versioni future (409 se è già in vigore), della sede o della persona.
     */
    public function delete(WorkSchedule $schedule, User $actor): void
    {
        DB::transaction(function () use ($schedule): void {
            $locked = WorkSchedule::query()->lockForUpdate()->findOrFail($schedule->id);

            if ($locked->isStarted(CarbonImmutable::now($locked->ownerTimezone()))) {
                throw new ConflictHttpException(Translate::text('locations.schedule_started'));
            }

            $locked->delete();
        });

        Log::info('Work schedule deleted', ['schedule_id' => $schedule->id, 'location_id' => $schedule->location_id, 'user_id' => $schedule->user_id, 'actor_id' => $actor->id]);
    }

    /**
     * La request controlla già la data: qui si riverifica sulle righe bloccate. Una versione che parte oggi è già
     * iniziata e non si cancella: il messaggio chiede una data da domani invece di cancellarla.
     */
    private function ensureValidFrom(CarbonImmutable $validFrom, CarbonImmutable $today, bool $taken): void
    {
        if ($validFrom->toDateString() < $today->toDateString()) {
            throw ValidationException::withMessages(['valid_from' => [Translate::text('locations.schedule_past')]]);
        }

        if ($taken) {
            $key = $validFrom->isSameDay($today) ? 'locations.schedule_started_today' : 'locations.schedule_exists';

            throw ValidationException::withMessages(['valid_from' => [Translate::text($key)]]);
        }
    }

    /**
     * Righe `follows_location`: minuti a zero, che il calendario non legge (spec §2.3).
     *
     * @return array<string, int>
     */
    private function restColumns(): array
    {
        return array_fill_keys(array_map(fn (string $day): string => "{$day}_minutes", WorkSchedule::DAYS), 0);
    }

    /**
     * @param  list<int>  $minutes
     * @return array<string, int>
     */
    private function minuteColumns(array $minutes): array
    {
        if (count($minutes) !== count(WorkSchedule::DAYS) || array_sum($minutes) === 0) {
            throw new InvalidArgumentException('A schedule needs seven values and at least one working day.');
        }

        return array_combine(array_map(fn (string $day): string => "{$day}_minutes", WorkSchedule::DAYS), $minutes);
    }
}
