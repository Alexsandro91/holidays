<?php

namespace App\Http\Resources;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Esito di un allineamento: la differenza scritta per ogni saldo indicato, anche 0 ("già allineato").
 *
 * @property array{aligned_on: CarbonImmutable, deltas: array<string, int>} $resource
 */
final class BalanceAlignmentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'aligned_on' => $this->resource['aligned_on']->toDateString(),
            'deltas' => $this->resource['deltas'],
        ];
    }
}
