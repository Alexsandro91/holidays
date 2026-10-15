<?php

namespace App\Http\Resources;

use App\Models\WorkSchedule;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Una versione di orario. `is_started` vale "oggi" nel fuso di chi la possiede (relazioni impostate dal controller).
 *
 * @mixin WorkSchedule
 */
final class WorkScheduleResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'valid_from' => $this->valid_from->toDateString(),
            'follows_location' => $this->follows_location,
            'minutes' => $this->minutes(),
            'is_started' => $this->isStarted(CarbonImmutable::now($this->ownerTimezone())),
        ];
    }
}
