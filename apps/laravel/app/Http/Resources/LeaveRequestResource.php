<?php

namespace App\Http\Resources;

use App\Enums\LeaveRequestStatus;
use App\Models\AbsenceType;
use App\Models\LeaveRequest;
use App\Models\LeaveRequestDay;
use App\Models\Location;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;

/**
 * Una richiesta di assenza. Le relazioni (`user`, `absenceType`, `decider`, `canceller`, `location`) le caricano i
 * controller: nessuna query qui. `days` solo nel dettaglio (relazione caricata), `warnings` solo dove il servizio li ha calcolati
 * (creazione, Da approvare). `can` combina policy e stato.
 *
 * @mixin LeaveRequest
 */
final class LeaveRequestResource extends JsonResource
{
    /**
     * Relazioni da caricare prima di usare la resource (`days` solo per il dettaglio).
     */
    public const RELATIONS = ['user', 'absenceType', 'decider', 'canceller', 'location:id,timezone'];

    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'user' => $this->whenLoaded('user', fn (User $user): array => ['id' => $user->id, 'name' => $user->name]),
            'absence_type' => $this->whenLoaded('absenceType', fn (AbsenceType $type): array => [
                'id' => $type->id,
                'name' => $type->displayName(),
                'balance' => $type->balance?->value,
            ]),
            'unit' => $this->unit->value,
            'starts_on' => $this->starts_on->toDateString(),
            'ends_on' => $this->ends_on->toDateString(),
            'half' => $this->half?->value,
            'starts_at' => $this->starts_at,
            'ends_at' => $this->ends_at,
            'minutes' => $this->minutes,
            'working_days' => (float) $this->working_days,
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'note' => $this->note,
            'decision_note' => $this->decision_note,
            'decided_by_name' => $this->relationLoaded('decider') ? $this->decider?->name : null,
            'decided_at' => $this->decided_at?->toIso8601String(),
            'cancellation_requested_at' => $this->cancellation_requested_at?->toIso8601String(),
            'cancelled_by_name' => $this->relationLoaded('canceller') ? $this->canceller?->name : null,
            'cancelled_at' => $this->cancelled_at?->toIso8601String(),
            'source' => $this->source->value,
            'can' => $this->permissions($request),
            'days' => $this->whenLoaded('days', fn (Collection $days): array => $days
                ->sortBy(fn (LeaveRequestDay $day): string => $day->date->toDateString())
                ->map(fn (LeaveRequestDay $day): array => ['date' => $day->date->toDateString(), 'minutes' => $day->minutes])
                ->values()
                ->all()),
            'warnings' => $this->when(
                array_key_exists('warnings', $this->resource->getAttributes()),
                fn (): mixed => $this->resource->getAttribute('warnings'),
            ),
        ];
    }

    /**
     * Policy (senza query) più stato più "prima che inizi" (fuso della sede, spec §4). Senza la sede caricata la
     * richiesta si considera iniziata: nessuna azione che lo richiede viene offerta.
     *
     * @return array{withdraw: bool, request_cancellation: bool, approve: bool, reject: bool, approve_cancellation: bool, reject_cancellation: bool, cancel: bool}
     */
    private function permissions(Request $request): array
    {
        $gate = Gate::forUser($request->user());
        $decide = $gate->allows('decide', $this->resource);
        $location = $this->relationLoaded('location') ? $this->location : null;
        $notStarted = $location instanceof Location && ! $this->resource->hasStarted(CarbonImmutable::now($location->timezone));
        $pending = $this->status === LeaveRequestStatus::Pending;
        $approved = $this->status === LeaveRequestStatus::Approved;
        $cancellationRequested = $this->status === LeaveRequestStatus::CancellationRequested;

        return [
            // Il ritiro di una richiesta in attesa è ammesso in qualunque momento (spec §4)
            'withdraw' => $pending && $gate->allows('withdraw', $this->resource),
            'request_cancellation' => $approved && $notStarted && $gate->allows('requestCancellation', $this->resource),
            // L'approvazione di una richiesta già iniziata è ammessa: l'approvatore può essere in ritardo
            'approve' => $pending && $decide,
            'reject' => $pending && $decide,
            'approve_cancellation' => $cancellationRequested && $decide,
            'reject_cancellation' => $cancellationRequested && $decide,
            'cancel' => $approved && $notStarted && $decide,
        ];
    }
}
