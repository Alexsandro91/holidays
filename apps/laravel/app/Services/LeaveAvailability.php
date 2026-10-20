<?php

namespace App\Services;

use App\Enums\AbsenceDayCount;
use App\Enums\AbsenceLimitPeriod;
use App\Enums\AbsenceLimitUnit;
use App\Enums\BalanceMovementKind;
use App\Enums\BalanceType;
use App\Enums\LeaveRequestStatus;
use App\Models\BalanceMovement;
use App\Models\LeaveRequest;
use App\Models\Location;
use App\Models\User;
use App\Support\LeaveComputation;
use App\Support\LeaveDraft;
use Carbon\CarbonImmutable;

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

        $inHours = $type->limit_unit === AbsenceLimitUnit::Hours;
        $new = $this->contributions($computation->days, $computation->workingDays, $computation->minutes, $inHours, $type->day_count === AbsenceDayCount::Calendar);

        // Per richiesta conta solo la richiesta stessa, altrimenti si sommano quelle già presenti nello stesso periodo
        $totals = [];
        foreach ($new as $day => $value) {
            $totals[$this->bucket($type->limit_period, $day)] = ($totals[$this->bucket($type->limit_period, $day)] ?? 0) + $value;
        }

        if ($type->limit_period !== AbsenceLimitPeriod::Request) {
            $existing = LeaveRequest::query()
                ->where('user_id', $draft->user->id)
                ->where('absence_type_id', $type->id)
                ->active()
                ->when($excludeRequestId !== null, fn ($query) => $query->whereKeyNot($excludeRequestId))
                ->whereHas('days', fn ($query) => $query->whereBetween('date', $this->bounds($type->limit_period, array_keys($totals))))
                ->with('days')
                ->get();

            foreach ($existing as $request) {
                $days = array_map(fn ($day): array => ['date' => $day->date->toDateString(), 'minutes' => $day->minutes], $request->days->all());
                $values = $this->contributions($days, (float) $request->working_days, $request->minutes, $inHours, $type->day_count === AbsenceDayCount::Calendar);

                foreach ($values as $day => $value) {
                    $key = $this->bucket($type->limit_period, $day);

                    if (array_key_exists($key, $totals)) {
                        $totals[$key] += $value;
                    }
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
