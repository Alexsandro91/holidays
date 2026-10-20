<?php

namespace App\Services;

use App\Enums\BalanceMovementKind;
use App\Enums\BalanceType;
use App\Enums\UserStatus;
use App\Models\BalanceAlignment;
use App\Models\BalanceMovement;
use App\Models\User;
use App\Support\YearSummary;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

/**
 * Unico punto di lettura dei saldi (spec §5): il saldo a una data è la somma dei movimenti con `effective_on` fino a
 * quella data. Non scrive nulla.
 */
final class BalanceLedger
{
    public const MOVEMENTS_PER_PAGE = 20;

    public function balanceAt(User $user, BalanceType $balance, CarbonImmutable $date): int
    {
        return (int) BalanceMovement::query()
            ->where('user_id', $user->id)
            ->where('balance', $balance)
            ->where('effective_on', '<=', $date->toDateString())
            ->sum('minutes');
    }

    /**
     * @return array<string, int> per `BalanceType->value`, tutti e tre i saldi
     */
    public function balancesAt(User $user, CarbonImmutable $date): array
    {
        return $this->currentFor(new Collection([$user]), $date)[$user->id];
    }

    /**
     * Saldi di più persone a un giorno, in una query (`SUM … GROUP BY`).
     *
     * @param  Collection<int, User>  $users
     * @return array<int, array<string, int>> per persona, i minuti per `BalanceType->value`
     */
    public function currentFor(Collection $users, CarbonImmutable $today): array
    {
        $ids = $users->pluck('id')->all();
        $balances = array_fill_keys($ids, $this->zeros());

        if ($ids === []) {
            return $balances;
        }

        $rows = BalanceMovement::query()
            ->whereIn('user_id', $ids)
            ->where('effective_on', '<=', $today->toDateString())
            ->groupBy('user_id', 'balance')
            ->selectRaw('user_id, balance, SUM(minutes) AS total')
            ->toBase()
            ->get();

        foreach ($rows as $row) {
            $balances[(int) $row->user_id][(string) $row->balance] = (int) $row->total;
        }

        return $balances;
    }

    /**
     * Riepilogo dell'anno per i tre saldi (spec §5.3). Il saldo è quello a oggi per l'anno in corso, al 31/12 per un
     * anno passato; maturato, usato e correzioni sommano i movimenti dell'anno fino a quel giorno, così i conti tornano
     * sempre. `$today` è nel fuso della sede della persona.
     *
     * @return array<string, YearSummary> per `BalanceType->value`
     */
    public function yearSummary(User $user, int $year, CarbonImmutable $today): array
    {
        $start = CarbonImmutable::create($year, 1, 1);
        $end = $start->endOfYear()->startOfDay()->min($today->startOfDay());

        $opening = $this->zeros();
        $openingRows = BalanceMovement::query()
            ->where('user_id', $user->id)
            ->where('effective_on', '<', $start->toDateString())
            ->groupBy('balance')
            ->selectRaw('balance, SUM(minutes) AS total')
            ->toBase()
            ->get();

        foreach ($openingRows as $row) {
            $opening[(string) $row->balance] = (int) $row->total;
        }

        $byKind = [];
        $yearRows = BalanceMovement::query()
            ->where('user_id', $user->id)
            ->whereBetween('effective_on', [$start->toDateString(), $end->toDateString()])
            ->groupBy('balance', 'kind')
            ->selectRaw('balance, kind, SUM(minutes) AS total')
            ->toBase()
            ->get();

        foreach ($yearRows as $row) {
            $byKind[(string) $row->balance][(string) $row->kind] = (int) $row->total;
        }

        $summaries = [];

        foreach (BalanceType::cases() as $balance) {
            $kinds = $byKind[$balance->value] ?? [];
            $accrued = $kinds[BalanceMovementKind::Accrual->value] ?? 0;
            $used = $kinds[BalanceMovementKind::Usage->value] ?? 0;
            $corrections = ($kinds[BalanceMovementKind::Adjustment->value] ?? 0) + ($kinds[BalanceMovementKind::Alignment->value] ?? 0);
            $openingMinutes = $opening[$balance->value];

            $summaries[$balance->value] = new YearSummary($openingMinutes, $accrued, $used, $corrections, $openingMinutes + $accrued + $used + $corrections);
        }

        return $summaries;
    }

    /**
     * Movimenti dal più recente, 20 per pagina, con la richiesta dei movimenti `usage`. Chi ha agito si carica solo per
     * lo staff: nel profilo resta nascosto.
     *
     * @return LengthAwarePaginator<int, BalanceMovement>
     */
    public function movements(User $user, ?BalanceType $balance, ?int $year, bool $withActor): LengthAwarePaginator
    {
        return BalanceMovement::query()
            ->where('user_id', $user->id)
            ->when($balance !== null, fn (Builder $query) => $query->where('balance', $balance))
            ->when($year !== null, fn (Builder $query) => $query->whereBetween('effective_on', ["{$year}-01-01", "{$year}-12-31"]))
            ->when($withActor, fn (Builder $query) => $query->with('actor:id,first_name,last_name'))
            // Tipo e date della richiesta per descrivere i movimenti `usage`
            ->with([
                'leaveRequest:id,absence_type_id,starts_on,ends_on,source',
                'leaveRequest.absenceType:id,code,name',
            ])
            ->orderByDesc('effective_on')
            ->orderByDesc('id')
            ->paginate(self::MOVEMENTS_PER_PAGE);
    }

    /**
     * Data dell'ultimo allineamento di ogni persona, su qualunque saldo (anche quelli senza differenze), in una query.
     *
     * @param  Collection<int, User>  $users
     * @return array<int, ?string> per persona, `Y-m-d` o null
     */
    public function lastAlignedOn(Collection $users): array
    {
        $ids = $users->pluck('id')->all();
        $last = array_fill_keys($ids, null);

        if ($ids === []) {
            return $last;
        }

        $rows = BalanceAlignment::query()
            ->whereIn('user_id', $ids)
            ->groupBy('user_id')
            ->selectRaw('user_id, MAX(aligned_on) AS last_aligned_on')
            ->toBase()
            ->get();

        foreach ($rows as $row) {
            $last[(int) $row->user_id] = CarbonImmutable::parse((string) $row->last_aligned_on)->toDateString();
        }

        return $last;
    }

    /**
     * Ultimo allineamento di un saldo della persona, anche senza differenza (spec §5.2).
     */
    public function lastAlignmentFor(User $user, BalanceType $balance): ?CarbonImmutable
    {
        $last = BalanceAlignment::query()
            ->where('user_id', $user->id)
            ->where('balance', $balance)
            ->max('aligned_on');

        return $last === null ? null : CarbonImmutable::parse((string) $last)->startOfDay();
    }

    /**
     * A chi si applicano i saldi (spec §6.1): dipendenti non più invitati, e chiunque abbia già movimenti (per
     * correggere il residuo di un ex dipendente).
     */
    public function applies(User $user): bool
    {
        if ($user->isEmployee() && $user->status !== UserStatus::Invited) {
            return true;
        }

        return BalanceMovement::query()->where('user_id', $user->id)->exists();
    }

    /**
     * @return array<string, int>
     */
    private function zeros(): array
    {
        return array_fill_keys(array_map(fn (BalanceType $balance): string => $balance->value, BalanceType::cases()), 0);
    }
}
