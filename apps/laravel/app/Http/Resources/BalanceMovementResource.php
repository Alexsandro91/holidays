<?php

namespace App\Http\Resources;

use App\Models\BalanceMovement;
use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Un movimento di saldo. `actor_name` c'è solo se chi l'ha letto ha caricato chi ha agito (lo staff): nel profilo è
 * sempre null. `leave_request` (tipo e date della richiesta dei movimenti `usage`) c'è solo se chi legge ha caricato
 * `leaveRequest.absenceType`. La descrizione la compone il frontend.
 *
 * @mixin BalanceMovement
 */
final class BalanceMovementResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $actor = $this->relationLoaded('actor') ? $this->actor : null;
        $leaveRequest = $this->relationLoaded('leaveRequest') ? $this->leaveRequest : null;

        return [
            'id' => $this->id,
            'balance' => $this->balance->value,
            'kind' => $this->kind->value,
            'minutes' => $this->minutes,
            'effective_on' => $this->effective_on->toDateString(),
            'period' => $this->period,
            'target_minutes' => $this->target_minutes,
            'note' => $this->note,
            'actor_name' => $actor instanceof User ? $actor->name : null,
            'leave_request' => $leaveRequest instanceof LeaveRequest && $leaveRequest->relationLoaded('absenceType') ? [
                'id' => $leaveRequest->id,
                'absence_type_name' => $leaveRequest->absenceType?->displayName(),
                'starts_on' => $leaveRequest->starts_on->toDateString(),
                'ends_on' => $leaveRequest->ends_on->toDateString(),
                'source' => $leaveRequest->source->value,
            ] : null,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
