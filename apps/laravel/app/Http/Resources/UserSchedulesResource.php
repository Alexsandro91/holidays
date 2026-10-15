<?php

namespace App\Http\Resources;

use App\Models\WorkSchedule;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * Orario di una persona: le sue versioni personali e l'orario della sede che vale oggi (spec §4.4).
 *
 * @property array{schedules: Collection<int, WorkSchedule>, location_schedule: WorkSchedule|null} $resource
 */
final class UserSchedulesResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $locationSchedule = $this->resource['location_schedule'];

        return [
            'schedules' => WorkScheduleResource::collection($this->resource['schedules']),
            'location_schedule' => $locationSchedule === null ? null : new WorkScheduleResource($locationSchedule),
        ];
    }
}
