<?php

namespace App\Http\Resources;

use App\Models\WorkSchedule;
use App\Support\WorkDay;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * Calendario dell'anno di una sede (spec §3.2): versioni dell'orario in vigore nell'anno e giorni non lavorativi
 * diversi dal solo riposo settimanale, ciascuno con tutti i suoi motivi.
 *
 * @property array{year: int, schedules: Collection<int, WorkSchedule>, days: list<WorkDay>} $resource
 */
final class LocationCalendarResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'year' => $this->resource['year'],
            'schedules' => WorkScheduleResource::collection($this->resource['schedules']),
            'days' => array_map(fn (WorkDay $day): array => [
                'date' => $day->date->toDateString(),
                'reasons' => array_map(fn (array $reason): array => ['type' => $reason['type']->value, 'label' => $reason['label']], $day->reasons),
            ], $this->resource['days']),
        ];
    }
}
