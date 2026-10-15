<?php

namespace App\Http\Resources;

use App\Models\Closure as CompanyClosure;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Chiusura con il nome della sede (null = tutte), caricato dal controller.
 *
 * @mixin CompanyClosure
 */
final class ClosureResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'location_id' => $this->location_id,
            'location_name' => $this->relationLoaded('location') ? $this->location?->name : null,
            'starts_on' => $this->starts_on->toDateString(),
            'ends_on' => $this->ends_on->toDateString(),
            'description' => $this->description,
        ];
    }
}
