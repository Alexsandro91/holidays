<?php

namespace App\Services;

use App\Enums\AbsenceDayCount;
use App\Enums\AbsenceLimitPeriod;
use App\Enums\AbsenceLimitUnit;
use App\Enums\BalanceMovementKind;
use App\Enums\BalanceType;
use App\Enums\LeaveRequestStatus;
use App\Models\AbsenceType;
use App\Models\BalanceMovement;
use App\Models\LeaveRequest;
use App\Models\LeaveRequestDay;
use App\Models\Location;
use App\Models\User;
use App\Support\LeaveComputation;
use App\Support\LeaveDraft;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/**
 * Saldo disponibile e avvisi di una richiesta (spec §5.2). Gli avvisi non bloccano mai: li mostrano l'anteprima, la
 * creazione e l'approvatore.
 */
final class LeaveAvailability
{
    public function __construct(
        private readonly BalanceLedger $ledger,
        private readonly WorkScheduleService $schedules,
    ) {}

    /**
     * Usato approvato con effetto dopo oggi, come valore positivo.
     */
    public function planned(User $user, BalanceType $balance, CarbonImmutable $today): int
    {
        return -(int) BalanceMovement::query()
            ->where('user_id', $user->id)
            ->where('balance', $balance)
            ->where('kind', BalanceMovementKind::Usage)
            ->where('effective_on', '>', $today->toDateString())
            ->sum('minutes');
    }

    /**
     * Minuti delle richieste in attesa dei tipi che scalano da quel saldo.
     */
    public function pending(User $user, BalanceType $balance, ?int $excludeRequestId = null): int
    {
        return (int) LeaveRequest::query()
            ->where('user_id', $user->id)
            ->where('status', LeaveRequestStatus::Pending)
            ->whereHas('absenceType', fn ($query) => $query->where('balance', $balance))
            ->when($excludeRequestId !== null, fn ($query) => $query->whereKeyNot($excludeRequestId))
            ->sum('minutes');
    }

    /**
     * Saldo a oggi meno usato futuro e richieste in attesa; le maturazioni future non si contano.
     */
    public function available(User $user, BalanceType $balance, CarbonImmutable $today, ?int $excludeRequestId = null): int
    {
        return $this->ledger->balanceAt($user, $balance, $today)
            - $this->planned($user, $balance, $today)
            - $this->pending($user, $balance, $excludeRequestId);
    }

    /**
     * @return list<array{code: string, params: array<string, int|float|string>}>
     */
    public function warnings(LeaveDraft $draft, LeaveComputation $computation, ?int $excludeRequestId = null): array
    {
        $warnings = [];

        $balanceWarning = $this->balanceWarning($draft, $computation, $excludeRequestId);
        if ($balanceWarning !== null) {
            $warnings[] = $balanceWarning;
        }

        $limitWarning = $this->limitWarning($draft, $computation, $excludeRequestId);
        if ($limitWarning !== null) {
            $warnings[] = $limitWarning;
        }

        return $warnings;
    }

    /**
     * Avvisi aggiornati di più richieste in attesa (Da approvare), con un numero di query che non dipende da quante
     * sono: ogni richiesta è valutata come se fosse appena stata fatta, senza contare sé stessa tra le in attesa.
     * Richiede `user`, `absenceType` e `location` caricati. Le richieste che non sono `pending` non hanno avvisi.
     *
     * @param  Collection<int, LeaveRequest>  $requests
     * @return array<int, list<array{code: string, params: array<string, int|float|string>}>> per id richiesta
     */
    public function warningsForRequests(Collection $requests): array
    {
        $pending = $requests->filter(fn (LeaveRequest $request): bool => $request->status === LeaveRequestStatus::Pending);
        $result = array_fill_keys($requests->pluck('id')->all(), []);

        if ($pending->isEmpty()) {
            return $result;
        }

        $days = LeaveRequestDay::query()
            ->whereIn('leave_request_id', $pending->pluck('id')->all())
            ->toBase()
            ->get(['leave_request_id', 'date', 'minutes'])
            ->groupBy('leave_request_id');

        $balances = $this->balanceFigures($pending);
        $existingByKey = $this->existingForLimits($pending);

        foreach ($pending as $request) {
            $type = $request->absenceType;
            $draftDays = array_map(
                fn (object $day): array => ['date' => substr((string) $day->date, 0, 10), 'minutes' => (int) $day->minutes],
                ($days->get($request->id) ?? collect())->all(),
            );
            $warnings = [];

            if ($type->balance !== null) {
                $figures = $balances[$request->user_id][$type->balance->value] ?? ['balance' => 0, 'planned' => 0, 'pending' => 0];
                $after = $figures['balance'] - $figures['planned'] - ($figures['pending'] - $request->minutes) - $request->minutes;

                if ($after < 0) {
                    $warnings[] = ['code' => 'balance_insufficient', 'params' => ['after_minutes' => $after]];
                }
            }

            $others = array_filter($existingByKey["{$request->user_id}:{$type->id}"] ?? [], fn (LeaveRequest $other): bool => $other->id !== $request->id);
            $limit = $this->evaluateLimit($type, $draftDays, (float) $request->working_days, $request->minutes, $others);

            if ($limit !== null) {
                $warnings[] = $limit;
            }

            $result[$request->id] = $warnings;
        }

        return $result;
    }

    /**
     * Saldo a oggi, usato futuro e minuti in attesa per persona e saldo, in una query per ogni "oggi" distinto
     * (le sedi in fusi diversi) più una per le richieste in attesa.
     *
     * @param  Collection<int, LeaveRequest>  $requests
     * @return array<int, array<string, array{balance: int, planned: int, pending: int}>>
     */
    private function balanceFigures(Collection $requests): array
    {
        $figures = [];
        $withBalance = $requests->filter(fn (LeaveRequest $request): bool => $request->absenceType->balance !== null);

        $byToday = $withBalance->groupBy(fn (LeaveRequest $request): string => $this->schedules->today($request->location)->toDateString());

        foreach ($byToday as $today => $group) {
            $rows = BalanceMovement::query()
                ->whereIn('user_id', $group->pluck('user_id')->unique()->all())
                ->groupBy('user_id', 'balance')
                ->selectRaw(
                    'user_id, balance, SUM(CASE WHEN effective_on <= ? THEN minutes ELSE 0 END) AS total, SUM(CASE WHEN kind = ? AND effective_on > ? THEN -minutes ELSE 0 END) AS planned',
                    [$today, BalanceMovementKind::Usage->value, $today],
                )
                ->toBase()
                ->get();

            foreach ($rows as $row) {
                $figures[(int) $row->user_id][(string) $row->balance] = ['balance' => (int) $row->total, 'planned' => (int) $row->planned, 'pending' => 0];
            }
        }

        if ($withBalance->isEmpty()) {
            return $figures;
        }

        $pendingRows = LeaveRequest::query()
            ->join('absence_types', 'absence_types.id', '=', 'leave_requests.absence_type_id')
            ->where('leave_requests.status', LeaveRequestStatus::Pending)
            ->whereNotNull('absence_types.balance')
            ->whereIn('leave_requests.user_id', $withBalance->pluck('user_id')->unique()->all())
            ->groupBy('leave_requests.user_id', 'absence_types.balance')
            ->selectRaw('leave_requests.user_id AS user_id, absence_types.balance AS balance, SUM(leave_requests.minutes) AS total')
            ->toBase()
            ->get();

        foreach ($pendingRows as $row) {
            $current = $figures[(int) $row->user_id][(string) $row->balance] ?? ['balance' => 0, 'planned' => 0, 'pending' => 0];
            $current['pending'] = (int) $row->total;
            $figures[(int) $row->user_id][(string) $row->balance] = $current;
        }

        return $figures;
    }

    /**
     * Richieste attive (con `days`) delle stesse persone e degli stessi tipi con limite, in una query: un
     * soprainsieme di quelle che servono, filtrato per periodo da `evaluateLimit`.
     *
     * @param  Collection<int, LeaveRequest>  $requests
     * @return array<string, list<LeaveRequest>> per `userId:typeId`
     */
    private function existingForLimits(Collection $requests): array
    {
        $limited = $requests->filter(fn (LeaveRequest $request): bool => $request->absenceType->limit_amount !== null
            && $request->absenceType->limit_period !== null
            && $request->absenceType->limit_period !== AbsenceLimitPeriod::Request);

        if ($limited->isEmpty()) {
            return [];
        }

        $grouped = [];
        foreach ($this->activeRequestsWithDays($limited) as $other) {
            $grouped["{$other->user_id}:{$other->absence_type_id}"][] = $other;
        }

        return $grouped;
    }

    /**
     * @param  Collection<int, LeaveRequest>  $limited
     * @return Collection<int, LeaveRequest>
     */
    private function activeRequestsWithDays(Collection $limited): Collection
    {
        return LeaveRequest::query()
            ->whereIn('user_id', $limited->pluck('user_id')->unique()->all())
            ->whereIn('absence_type_id', $limited->pluck('absence_type_id')->unique()->all())
            ->active()
            ->with('days')
            ->get();
    }

    /**
     * @return array{code: string, params: array<string, int|float|string>}|null
     */
    private function balanceWarning(LeaveDraft $draft, LeaveComputation $computation, ?int $excludeRequestId): ?array
    {
        $balance = $draft->type->balance;

        if ($balance === null) {
            return null;
        }

        /** @var Location $location */
        $location = $draft->user->location()->firstOrFail();
        $after = $this->available($draft->user, $balance, $this->schedules->today($location), $excludeRequestId) - $computation->minutes;

        return $after < 0 ? ['code' => 'balance_insufficient', 'params' => ['after_minutes' => $after]] : null;
    }

    /**
     * @return array{code: string, params: array<string, int|float|string>}|null
     */
    private function limitWarning(LeaveDraft $draft, LeaveComputation $computation, ?int $excludeRequestId): ?array
    {
        $type = $draft->type;

        if ($type->limit_amount === null || $type->limit_unit === null || $type->limit_period === null) {
            return null;
        }

        $existing = [];

        if ($type->limit_period !== AbsenceLimitPeriod::Request) {
            $buckets = array_unique(array_map(fn (array $day): string => $this->bucket($type->limit_period, $day['date']), $computation->days));

            $existing = LeaveRequest::query()
                ->where('user_id', $draft->user->id)
                ->where('absence_type_id', $type->id)
                ->active()
                ->when($excludeRequestId !== null, fn ($query) => $query->whereKeyNot($excludeRequestId))
                ->whereHas('days', fn ($query) => $query->whereBetween('date', $this->bounds($type->limit_period, $buckets)))
                ->with('days')
                ->get()
                ->all();
        }

        return $this->evaluateLimit($type, $computation->days, $computation->workingDays, $computation->minutes, $existing);
    }

    /**
     * Confronta con il limite del tipo la richiesta (giorni, giorni contati, minuti) sommata alle altre già attive
     * (con `days` caricati) nello stesso periodo.
     *
     * @param  list<array{date: string, minutes: int}>  $days
     * @param  iterable<LeaveRequest>  $existing
     * @return array{code: string, params: array<string, int|float|string>}|null
     */
    private function evaluateLimit(AbsenceType $type, array $days, float $workingDays, int $minutes, iterable $existing): ?array
    {
        if ($type->limit_amount === null || $type->limit_unit === null || $type->limit_period === null) {
            return null;
        }

        $inHours = $type->limit_unit === AbsenceLimitUnit::Hours;
        $calendar = $type->day_count === AbsenceDayCount::Calendar;

        // Per richiesta conta solo la richiesta stessa, altrimenti si sommano quelle già presenti nello stesso periodo.
        // Contano solo i periodi in cui la richiesta pesa davvero: un mese toccato solo da giorni di riposo non avvisa
        $totals = [];
        foreach ($this->contributions($days, $workingDays, $minutes, $inHours, $calendar) as $day => $value) {
            if ($value <= 0) {
                continue;
            }

            $key = $this->bucket($type->limit_period, $day);
            $totals[$key] = ($totals[$key] ?? 0) + $value;
        }

        if ($totals === []) {
            return null;
        }

        foreach ($existing as $request) {
            $otherDays = array_map(fn ($day): array => ['date' => $day->date->toDateString(), 'minutes' => $day->minutes], $request->days->all());
            $values = $this->contributions($otherDays, (float) $request->working_days, $request->minutes, $inHours, $calendar);

            foreach ($values as $day => $value) {
                $key = $this->bucket($type->limit_period, $day);

                if (array_key_exists($key, $totals)) {
                    $totals[$key] += $value;
                }
            }
        }

        $limit = $type->limit_amount * ($inHours ? 60 : 1);
        $worst = round((float) max($totals), 2);

        if ($worst <= $limit) {
            return null;
        }

        return ['code' => 'limit_exceeded', 'params' => [
            'limit' => $type->limit_amount,
            'unit' => $type->limit_unit->value,
            'period' => $type->limit_period->value,
            'total' => round($inHours ? $worst / 60 : $worst, 2),
        ]];
    }

    /**
     * Quanto pesa ogni giorno sul limite: i minuti per un limite in ore; i giorni (`working_days` ripartiti sui minuti,
     * oppure uno per giorno di calendario) per un limite in giorni, così le ore contano per frazione di giorno.
     *
     * @param  list<array{date: string, minutes: int}>  $days
     * @return array<string, float|int> per data `Y-m-d`
     */
    private function contributions(array $days, float $workingDays, int $minutes, bool $inHours, bool $calendar): array
    {
        $values = [];

        foreach ($days as $day) {
            $values[$day['date']] = match (true) {
                $inHours => $day['minutes'],
                $calendar => 1,
                $minutes > 0 => $workingDays * $day['minutes'] / $minutes,
                default => 0,
            };
        }

        return $values;
    }

    /**
     * Primo e ultimo giorno dei periodi toccati dalla richiesta.
     *
     * @param  list<string>  $buckets  chiavi `YYYY-MM` o `YYYY`
     * @return array{string, string}
     */
    private function bounds(AbsenceLimitPeriod $period, array $buckets): array
    {
        $unit = $period === AbsenceLimitPeriod::Year ? 'year' : 'month';
        $first = CarbonImmutable::parse(min($buckets).($unit === 'year' ? '-01-01' : '-01'))->startOf($unit);
        $last = CarbonImmutable::parse(max($buckets).($unit === 'year' ? '-01-01' : '-01'))->endOf($unit);

        return [$first->toDateString(), $last->toDateString()];
    }

    private function bucket(AbsenceLimitPeriod $period, string $date): string
    {
        return match ($period) {
            AbsenceLimitPeriod::Month => substr($date, 0, 7),
            AbsenceLimitPeriod::Year => substr($date, 0, 4),
            AbsenceLimitPeriod::Request => 'request',
        };
    }
}
