<?php

namespace App\Http\Resources;

use App\Models\AbsenceType;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Tipo di assenza visto da una persona: nome, se è abilitata e cosa serve al form della richiesta. `enabled` lo calcola `AbsenceTypeEnablementService`.
 *
 * @mixin AbsenceType
 */
final class AbsenceTypeOptionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->displayName(),
            'requires_enablement' => $this->requires_enablement,
            'enabled' => (bool) $this->getAttribute('enabled'),
            // Per il form della richiesta: unità offerte, saldo, conteggio dei giorni e limite (fase 3, spec §6)
            'allows_days' => $this->allows_days,
            'allows_half_days' => $this->allows_half_days,
            'allows_hours' => $this->allows_hours,
            'balance' => $this->balance?->value,
            'day_count' => $this->day_count->value,
            'limit' => $this->limit_amount === null || $this->limit_unit === null || $this->limit_period === null ? null : [
                'amount' => $this->limit_amount,
                'unit' => $this->limit_unit->value,
                'period' => $this->limit_period->value,
            ],
        ];
    }
}
