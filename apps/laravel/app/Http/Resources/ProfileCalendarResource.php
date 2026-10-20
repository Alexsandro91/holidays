<?php

namespace App\Http\Resources;

use App\Models\LeaveRequest;
use App\Support\WorkDay;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Calendario personale (spec §6): ogni giorno dell'intervallo con i minuti (0 se non lavorativo) e i motivi, e le
 * proprie richieste che lo toccano.
 *
 * @property array{days: list<WorkDay>, requests: Collection<int, LeaveRequest>} $resource
 */
final class ProfileCalendarResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'days' => array_map(fn (WorkDay $day): array => [
                'date' => $day->date->toDateString(),
                'minutes' => $day->isWorking() ? $day->minutes : 0,
                'reasons' => array_map(fn (array $reason): array => ['type' => $reason['type']->value, 'label' => $reason['label']], $day->reasons),
            ], $this->resource['days']),
            'requests' => LeaveRequestResource::collection($this->resource['requests']),
        ];
    }
}
