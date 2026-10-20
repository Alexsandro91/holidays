<?php

namespace App\Services;

use App\Enums\AbsenceDayCount;
use App\Enums\LeaveUnit;
use App\Models\Location;
use App\Support\LeaveComputation;
use App\Support\LeaveDraft;
use App\Support\Translate;
use App\Support\WorkDay;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

/**
 * Minuti e giorni di una richiesta di assenza (spec §3.1, §5.1), su `WorkCalendar` e nel fuso della sede.
 * Applica le regole che dipendono da calendario e ora; quelle sulla sola forma dell'input (formato, `ends_on` ≥
 * `starts_on`, unità permessa dal tipo) restano alla FormRequest e al servizio delle richieste.
 */
final class LeaveCalculator
{
    /**
     * Passo degli orari e durata minima di una richiesta a ore.
     */
    public const HOURS_STEP = 30;

    public function __construct(
        private readonly WorkCalendar $calendar,
        private readonly WorkScheduleService $schedules,
    ) {}

    /**
     * @throws ValidationException
     */
    public function compute(LeaveDraft $draft): LeaveComputation
    {
        /** @var Location $location */
        $location = $draft->user->location()->firstOrFail();
        $today = $this->schedules->today($location);
        $from = $draft->startsOn->startOfDay();
        $to = $draft->endsOn->startOfDay();

        if ($from->toDateString() < $today->toDateString()) {
            $this->fail('starts_on', 'leave.past');
        }

        if ((int) $from->diffInDays($to) + 1 > WorkCalendar::MAX_DAYS) {
            $this->fail('ends_on', 'leave.range_too_long', ['max' => WorkCalendar::MAX_DAYS]);
        }

        if ($draft->unit !== LeaveUnit::Days && $from->toDateString() !== $to->toDateString()) {
            $this->fail('starts_on', 'leave.single_day');
        }

        // Una sola lettura del calendario per bozza
        $days = $this->calendar->forUser($draft->user, $from, $to);

        return match ($draft->unit) {
            LeaveUnit::Days => $this->days($draft, $days),
            LeaveUnit::HalfDay => $this->halfDay($days[0]),
            LeaveUnit::Hours => $this->hours($draft, $days[0], $today, $location),
        };
    }

    /**
     * Ogni giorno vale i suoi minuti (0 per riposo, festivi, patrono e chiusure); i tipi a giorni di calendario
     * contano tutti i giorni dell'intervallo.
     *
     * @param  list<WorkDay>  $days
     */
    private function days(LeaveDraft $draft, array $days): LeaveComputation
    {
        $rows = array_map(fn (WorkDay $day): array => [
            'date' => $day->date->toDateString(),
            'minutes' => $day->isWorking() ? $day->minutes : 0,
        ], $days);
        $minutes = array_sum(array_column($rows, 'minutes'));
        $workingDays = count(array_filter($days, fn (WorkDay $day): bool => $day->isWorking()));

        if ($draft->type->day_count === AbsenceDayCount::Calendar) {
            return new LeaveComputation($rows, $minutes, (float) count($days));
        }

        if ($workingDays === 0) {
            $this->fail('starts_on', 'leave.no_working_days');
        }

        return new LeaveComputation($rows, $minutes, (float) $workingDays);
    }

    /**
     * Metà dei minuti del giorno, arrotondata al minuto per eccesso (455 → 228).
     */
    private function halfDay(WorkDay $day): LeaveComputation
    {
        $this->ensureWorking($day);
        $minutes = intdiv($day->minutes + 1, 2);

        return new LeaveComputation([['date' => $day->date->toDateString(), 'minutes' => $minutes]], $minutes, 0.5);
    }

    /**
     * Fascia oraria a multipli di 30 minuti, non oltre i minuti del giorno; per oggi deve iniziare dopo l'ora attuale
     * della sede. L'orario non ha fasce, quindi non si confronta con un turno.
     */
    private function hours(LeaveDraft $draft, WorkDay $day, CarbonImmutable $today, Location $location): LeaveComputation
    {
        $this->ensureWorking($day);
        $start = $this->minuteOfDay($draft->startsAt, 'starts_at');
        $end = $this->minuteOfDay($draft->endsAt, 'ends_at');

        if ($end <= $start) {
            $this->fail('ends_at', 'leave.hours_order');
        }

        $minutes = $end - $start;

        if ($minutes > $day->minutes) {
            $this->fail('ends_at', 'leave.hours_too_long');
        }

        if ($day->date->toDateString() === $today->toDateString()) {
            $now = CarbonImmutable::now($location->timezone);

            if ($start <= $now->hour * 60 + $now->minute) {
                $this->fail('starts_at', 'leave.hours_past');
            }
        }

        return new LeaveComputation(
            [['date' => $day->date->toDateString(), 'minutes' => $minutes]],
            $minutes,
            round($minutes / $day->minutes, 2),
        );
    }

    private function ensureWorking(WorkDay $day): void
    {
        if (! $day->isWorking()) {
            $this->fail('starts_on', 'leave.not_working_day');
        }
    }

    /**
     * Minuti dalla mezzanotte di un orario `H:i` (secondi `:00` tollerati), solo a multipli di 30 minuti.
     */
    private function minuteOfDay(?string $time, string $field): int
    {
        if ($time === null || preg_match('/^([01]\d|2[0-3]):([0-5]\d)(:00)?$/', $time, $parts) !== 1) {
            $this->fail($field, 'leave.hours_step');
        }

        $minute = (int) $parts[1] * 60 + (int) $parts[2];

        if ($minute % self::HOURS_STEP !== 0) {
            $this->fail($field, 'leave.hours_step');
        }

        return $minute;
    }

    /**
     * @param  array<string, string|int>  $replace
     *
     * @throws ValidationException
     */
    private function fail(string $field, string $key, array $replace = []): never
    {
        throw ValidationException::withMessages([$field => [Translate::text($key, $replace)]]);
    }
}
