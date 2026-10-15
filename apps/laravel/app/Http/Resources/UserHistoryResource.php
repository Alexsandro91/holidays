<?php

namespace App\Http\Resources;

use App\Support\HistoryEntry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Una tappa dello storico (spec §8): `actor_name` è null nel profilo.
 *
 * @property HistoryEntry $resource
 */
final class UserHistoryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource->entry->id,
            'event' => $this->resource->entry->event->value,
            'summary' => $this->resource->summary,
            'actor_name' => $this->resource->actorName,
            'occurred_at' => $this->resource->entry->created_at->toIso8601String(),
        ];
    }
}
