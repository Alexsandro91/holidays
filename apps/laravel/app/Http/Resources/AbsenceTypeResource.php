<?php

namespace App\Http\Resources;

use App\Models\AbsenceType;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Tipo di assenza con il nome già risolto. `enabled_users_count` solo se la lista l'ha caricato con `withCount`
 * (null per i tipi senza abilitazione).
 *
 * @mixin AbsenceType
 */
final class AbsenceTypeResource extends JsonResource
{
    /**
     * @return array<int|string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'name' => $this->displayName(),
            'custom_name' => $this->name,
            'is_system' => $this->isSystem(),
            'allows_days' => $this->allows_days,
            'allows_half_days' => $this->allows_half_days,
            'allows_hours' => $this->allows_hours,
            'balance' => $this->balance?->value,
            'requires_approval' => $this->requires_approval,
            'employment_types' => $this->employment_types,
            'requires_enablement' => $this->requires_enablement,
            'day_count' => $this->day_count->value,
            'requires_certificate' => $this->requires_certificate,
            'limit' => $this->limit_amount === null || $this->limit_unit === null || $this->limit_period === null ? null : [
                'amount' => $this->limit_amount,
                'unit' => $this->limit_unit->value,
                'period' => $this->limit_period->value,
            ],
            'position' => $this->position,
            'archived_at' => $this->archived_at?->toIso8601String(),
            $this->mergeWhen(array_key_exists('enabled_users_count', $this->getAttributes()), fn (): array => [
                'enabled_users_count' => $this->requires_enablement ? (int) $this->enabled_users_count : null,
            ]),
        ];
    }
}
