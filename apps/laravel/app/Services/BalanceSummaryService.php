<?php

namespace App\Services;

use App\Enums\BalanceType;
use App\Enums\UserStatus;
use App\Models\User;
use App\Support\EffectiveAccrual;
use App\Support\YearSummary;
use Carbon\CarbonImmutable;

/**
 * Riepilogo dei saldi di una persona per la scheda dello staff e per il profilo (spec §5.3, §6.2): stessi conti,
 * cambia solo cosa può fare chi guarda. "Oggi" è nel fuso della sede della persona.
 */
final class BalanceSummaryService
{
    public function __construct(
        private readonly BalanceLedger $ledger,
        private readonly AccrualSettingsService $accruals,
        private readonly WeeklyMinutes $weeklyMinutes,
        private readonly WorkScheduleService $schedules,
    ) {}

    /**
     * @return array{applicable: bool, year: int, weekly_minutes: int, location_weekly_minutes: int, average_day_minutes: int, last_aligned_on: ?string, current: array<string, int>, summaries: array<string, YearSummary>, accrual: EffectiveAccrual, monthly_quotas: array<string, int>}
     */
    public function summary(User $user, int $year): array
    {
        $location = $user->location()->firstOrFail();
        $user->setRelation('location', $location);
        $today = $this->schedules->today($location);
        $weekly = $this->weeklyMinutes->forUser($user, $today);
        $locationWeekly = $this->weeklyMinutes->forLocation($location, $today);
        $accrual = $this->accruals->forUser($user);
        // Quota attuale solo per chi oggi matura: dipendente con account attivo
        $accrues = $user->isEmployee() && $user->status === UserStatus::Active;
        $quotas = [];

        foreach (BalanceType::cases() as $balance) {
            $quotas[$balance->value] = $accrues
                ? BalanceAccrualService::monthlyQuota($accrual->minutes($balance), $weekly, $locationWeekly)
                : 0;
        }

        return [
            'applicable' => $this->ledger->applies($user),
            'year' => $year,
            'weekly_minutes' => $weekly,
            'location_weekly_minutes' => $locationWeekly,
            'average_day_minutes' => $this->weeklyMinutes->averageDayMinutes($user, $today),
            'last_aligned_on' => $this->ledger->lastAlignedOn(collect([$user]))[$user->id],
            'current' => $this->ledger->balancesAt($user, $today),
            'summaries' => $this->ledger->yearSummary($user, $year, $today),
            'accrual' => $accrual,
            'monthly_quotas' => $quotas,
        ];
    }

    /**
     * Saldi a un giorno e ultimo allineamento di ogni saldo: l'anteprima di "Allinea alla busta paga".
     *
     * @return array{balances: array<string, int>, last_alignment: array<string, ?string>}
     */
    public function at(User $user, CarbonImmutable $day): array
    {
        $last = [];

        foreach (BalanceType::cases() as $balance) {
            $last[$balance->value] = $this->ledger->lastAlignmentFor($user, $balance)?->toDateString();
        }

        return ['balances' => $this->ledger->balancesAt($user, $day), 'last_alignment' => $last];
    }
}
