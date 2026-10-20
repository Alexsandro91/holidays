<?php

namespace App\Http\Resources;

use App\Models\AbsenceType;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Tipo di assenza visto da una persona: nome e se è abilitata. `enabled` lo calcola `AbsenceTypeEnablementService`.
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
        ];
    }
}
