<?php

namespace App\Http\Resources;

use App\Enums\BalanceType;
use App\Support\EffectiveAccrual;
use App\Support\YearSummary;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Saldi di una persona (spec §5.3, §6.2): per ogni saldo il valore attuale, il riepilogo dell'anno, il valore annuo
 * effettivo con la provenienza e la quota mensile attuale. `can` lo decide il controller (nel profilo tutto falso).
 *
 * @property array{summary: array{applicable: bool, year: int, weekly_minutes: int, location_weekly_minutes: int, average_day_minutes: int, last_aligned_on: ?string, current: array<string, int>, summaries: array<string, YearSummary>, accrual: EffectiveAccrual, monthly_quotas: array<string, int>, planned: array<string, int>, pending: array<string, int>, available: array<string, int>}, can: array{adjust: bool, manage_accrual: bool}} $resource
 */
final class BalanceSummaryResource extends JsonResource
{
    /**
     * @param  array{applicable: bool, year: int, weekly_minutes: int, location_weekly_minutes: int, average_day_minutes: int, last_aligned_on: ?string, current: array<string, int>, summaries: array<string, YearSummary>, accrual: EffectiveAccrual, monthly_quotas: array<string, int>, planned: array<string, int>, pending: array<string, int>, available: array<string, int>}  $summary
     * @param  array{adjust: bool, manage_accrual: bool}  $can
     */
    public static function of(array $summary, array $can): self
    {
        return new self(['summary' => $summary, 'can' => $can]);
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $summary = $this->resource['summary'];
        $balances = [];

        foreach (BalanceType::cases() as $balance) {
            $year = $summary['summaries'][$balance->value];
            $balances[] = [
                'balance' => $balance->value,
                'label' => $balance->label(),
                'current_minutes' => $summary['current'][$balance->value],
                'summary' => [
                    'opening' => $year->opening,
                    'accrued' => $year->accrued,
                    'used' => $year->used,
                    'corrections' => $year->corrections,
                    'closing' => $year->closing,
                ],
                'annual' => ['minutes' => $summary['accrual']->minutes($balance), 'source' => $summary['accrual']->source($balance)],
                'monthly_quota_minutes' => $summary['monthly_quotas'][$balance->value],
                'planned_minutes' => $summary['planned'][$balance->value],
                'pending_minutes' => $summary['pending'][$balance->value],
                'available_minutes' => $summary['available'][$balance->value],
            ];
        }

        return [
            'applicable' => $summary['applicable'],
            'year' => $summary['year'],
            'weekly_minutes' => $summary['weekly_minutes'],
            'location_weekly_minutes' => $summary['location_weekly_minutes'],
            'average_day_minutes' => $summary['average_day_minutes'],
            'last_aligned_on' => $summary['last_aligned_on'],
            'balances' => $balances,
            'can' => $this->resource['can'],
        ];
    }
}
