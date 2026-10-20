<?php

namespace App\Services;

use App\Enums\BalanceMovementKind;
use App\Enums\BalanceType;
use App\Models\BalanceAlignment;
use App\Models\BalanceMovement;
use App\Models\Location;
use App\Models\User;
use App\Models\UserHistory;
use App\Support\AccrualRun;
use App\Support\EffectiveAccrual;
use App\Support\EmploymentTimeline;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Maturazione mensile dei saldi (spec §4.2, §4.3). Unico punto che scrive i movimenti `accrual`: idempotente per
 * (persona, saldo, mese), sotto lock della riga dell'utente come rettifiche e allineamenti.
 */
final class BalanceAccrualService
{
    /**
     * Persone lette per blocco: ogni blocco costa un numero fisso di query (più gli orari, una per persona).
     */
    public const CHUNK_SIZE = 200;

    /**
     * Giorno del secondo punto di controllo: matura chi è in forza almeno da metà mese.
     */
    public const MID_MONTH_DAY = 16;

    public function __construct(
        private readonly AccrualSettingsService $settings,
        private readonly WeeklyMinutes $weeklyMinutes,
    ) {}

    /**
     * Quota di un mese: `round(annuo × settimanali persona ÷ settimanali sede ÷ 12)`, half-up, in aritmetica intera
     * per non dipendere dagli arrotondamenti dei float. 0 se manca uno dei termini.
     */
    public static function monthlyQuota(int $annual, int $weekly, int $locationWeekly): int
    {
        if ($annual <= 0 || $weekly <= 0 || $locationWeekly <= 0) {
            return 0;
        }

        $numerator = $annual * $weekly;
        $denominator = $locationWeekly * 12;

        return intdiv(2 * $numerator + $denominator, 2 * $denominator);
    }

    /**
     * Matura il mese di `$month` per chi ne ha diritto all'istante `$now` e non l'ha ancora; restituisce i movimenti
     * scritti e le persone fallite. Il mese si legge come `YYYY-MM`: i giorni si contano nel fuso della sede di ogni
     * persona. Un errore su una persona non ferma le altre: si segnala, si logga e il prossimo giro la riprova.
     */
    public function accrue(CarbonImmutable $month, CarbonImmutable $now): AccrualRun
    {
        $period = $month->format('Y-m');
        $written = 0;
        $failed = 0;

        $this->candidates($period, $now)->chunkById(self::CHUNK_SIZE, function (Collection $users) use ($period, $now, &$written, &$failed): void {
            /** @var Collection<int, User> $users */
            $timelines = $this->timelines($users);
            $accruals = $this->settings->forUsers($users);
            $blocked = $this->blockedBalances($users->pluck('id')->all(), $period);

            foreach ($users as $user) {
                try {
                    $written += $this->accrueUser($user, $period, $now, $timelines[$user->id], $accruals[$user->id], $blocked[$user->id] ?? []);
                } catch (Throwable $exception) {
                    $failed++;
                    report($exception);
                    Log::error('Balance accrual failed', ['user_id' => $user->id, 'period' => $period, 'exception' => $exception]);
                }
            }
        });

        return new AccrualRun($written, $failed);
    }

    /**
     * Giorno di riferimento per l'orario (spec §4.2), `null` se la persona non matura il mese (§4.3). Matura chi è
     * dipendente attivo alla fine del 1° del mese, oppure alla fine del giorno `min(16, oggi)` (per un mese passato il
     * 16). I giorni sono quelli del fuso di `$month`; un mese non ancora iniziato non matura.
     */
    public function eligibility(EmploymentTimeline $timeline, CarbonImmutable $month, CarbonImmutable $now): ?CarbonImmutable
    {
        $first = $month->startOfMonth();
        $today = $now->setTimezone($first->getTimezone())->startOfDay();

        if ($today->lessThan($first)) {
            return null;
        }

        if ($timeline->isActiveEmployeeAt($first->endOfDay())) {
            return $first;
        }

        $secondDay = $today->isSameMonth($first) ? min(self::MID_MONTH_DAY, $today->day) : self::MID_MONTH_DAY;
        $second = $first->setDay($secondDay);

        return $timeline->isActiveEmployeeAt($second->endOfDay()) ? $second : null;
    }

    /**
     * Storico del rapporto delle persone, in una query.
     *
     * @param  Collection<int, User>  $users
     * @return array<int, EmploymentTimeline>
     */
    public function timelines(Collection $users): array
    {
        $events = UserHistory::query()
            ->whereIn('user_id', $users->pluck('id')->all())
            ->get()
            ->groupBy('user_id');

        $timelines = [];

        foreach ($users as $user) {
            $timelines[$user->id] = EmploymentTimeline::for($user, $events->get($user->id, collect()));
        }

        return $timelines;
    }

    /**
     * Chi esisteva già al più tardi dei punti di controllo: la regola esatta la applica lo storico. Il limite sul 16 è
     * largo di un giorno, così vale in qualunque fuso; `created_at` è in UTC, come i limiti.
     *
     * @return Builder<User>
     */
    private function candidates(string $period, CarbonImmutable $now): Builder
    {
        $latestCheckpoint = CarbonImmutable::parse("{$period}-01", 'UTC')->addDays(self::MID_MONTH_DAY + 1);

        return User::query()
            ->with('location')
            ->where('created_at', '<=', $now->utc()->min($latestCheckpoint));
    }

    /**
     * Saldi che il mese non può più maturare: già maturati, oppure con un allineamento (anche senza differenza) datato
     * dal 1° del mese in poi (la busta paga comprende già il mese, spec §4.3). Due query, qualunque sia il numero di
     * persone.
     *
     * @param  list<int>  $userIds
     * @return array<int, list<string>> per persona, i `BalanceType->value` da saltare
     */
    private function blockedBalances(array $userIds, string $period): array
    {
        $accrued = BalanceMovement::query()
            ->whereIn('user_id', $userIds)
            ->where('kind', BalanceMovementKind::Accrual)
            ->where('period', $period)
            ->toBase()
            ->get(['user_id', 'balance']);
        $aligned = BalanceAlignment::query()
            ->whereIn('user_id', $userIds)
            ->whereNotNull('balance')
            ->where('aligned_on', '>=', "{$period}-01")
            ->toBase()
            ->get(['user_id', 'balance']);

        return $accrued->concat($aligned)
            ->groupBy('user_id')
            ->map(fn (Collection $rows): array => $rows->pluck('balance')->map(fn (mixed $balance): string => (string) $balance)->unique()->values()->all())
            ->all();
    }

    /**
     * @param  list<string>  $blocked
     */
    private function accrueUser(User $user, string $period, CarbonImmutable $now, EmploymentTimeline $timeline, EffectiveAccrual $accrual, array $blocked): int
    {
        $balances = array_values(array_filter(
            BalanceType::cases(),
            fn (BalanceType $balance): bool => $accrual->minutes($balance) > 0 && ! in_array($balance->value, $blocked, true),
        ));

        if ($balances === []) {
            return 0;
        }

        $location = $user->location;
        $month = CarbonImmutable::parse("{$period}-01", $location->timezone ?? Location::DEFAULT_TIMEZONE);
        $referenceDay = $this->eligibility($timeline, $month, $now);

        if ($referenceDay === null) {
            return 0;
        }

        $weekly = $this->weeklyMinutes->forUser($user, $referenceDay);
        $locationWeekly = $this->weeklyMinutes->forLocation($location, $referenceDay);

        if ($locationWeekly === 0) {
            Log::warning('Balance accrual without location schedule', ['user_id' => $user->id, 'location_id' => $location->id, 'period' => $period]);

            return 0;
        }

        $quotas = [];

        foreach ($balances as $balance) {
            $quota = self::monthlyQuota($accrual->minutes($balance), $weekly, $locationWeekly);

            if ($quota > 0) {
                $quotas[$balance->value] = $quota;
            }
        }

        return $quotas === [] ? 0 : $this->write($user, $period, $quotas);
    }

    /**
     * Scrive le quote sotto lock della persona, ricontrollando quello che nel frattempo un altro giro o un allineamento
     * può aver scritto. Se l'indice unico ferma comunque un doppione, la persona si salta: il prossimo giro la riprende.
     *
     * @param  array<string, int>  $quotas  minuti per `BalanceType->value`
     */
    private function write(User $user, string $period, array $quotas): int
    {
        try {
            return DB::transaction(function () use ($user, $period, $quotas): int {
                User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();

                $blocked = $this->blockedBalances([$user->id], $period)[$user->id] ?? [];
                $createdAt = now();
                $rows = [];

                foreach ($quotas as $balance => $minutes) {
                    if (! in_array($balance, $blocked, true)) {
                        $rows[] = [
                            'user_id' => $user->id,
                            'balance' => $balance,
                            'kind' => BalanceMovementKind::Accrual->value,
                            'minutes' => $minutes,
                            'effective_on' => "{$period}-01",
                            'period' => $period,
                            'target_minutes' => null,
                            'note' => null,
                            'actor_id' => null,
                            'created_at' => $createdAt,
                        ];
                    }
                }

                if ($rows !== []) {
                    BalanceMovement::query()->insert($rows);
                }

                return count($rows);
            });
        } catch (UniqueConstraintViolationException $exception) {
            Log::info('Balance accrual skipped', ['user_id' => $user->id, 'period' => $period, 'exception' => $exception]);

            return 0;
        }
    }
}
