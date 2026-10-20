<?php

namespace App\Http\Resources;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Saldi nell'app a un giorno e ultimo allineamento di ogni saldo: l'anteprima di "Allinea alla busta paga".
 *
 * @property array{date: CarbonImmutable, balances: array<string, int>, last_alignment: array<string, ?string>} $resource
 */
final class BalancesAtResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'date' => $this->resource['date']->toDateString(),
            'balances' => $this->resource['balances'],
            'last_alignment' => $this->resource['last_alignment'],
        ];
    }
}
