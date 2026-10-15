<?php

namespace App\Http\Resources;

use App\Models\Location;
use App\Models\WorkSchedule;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Sede vista dall'admin. Conteggi da `withCount`/`loadCount`; `current_schedule` solo nel dettaglio.
 *
 * @mixin Location
 */
final class LocationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'city' => $this->city,
            'country' => $this->country,
            'timezone' => $this->timezone,
            'patron_day' => $this->patron_day,
            'patron_month' => $this->patron_month,
            'is_primary' => $this->isPrimary(),
            'archived_at' => $this->archived_at?->toIso8601String(),
            'users_count' => (int) $this->users_count,
            'managers_count' => (int) $this->managers_count,
            'current_schedule' => $this->whenLoaded('currentSchedule', fn (WorkSchedule $schedule): WorkScheduleResource => new WorkScheduleResource($schedule)),
        ];
    }
}
