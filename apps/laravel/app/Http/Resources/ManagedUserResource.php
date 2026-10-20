<?php

namespace App\Http\Resources;

use App\Enums\UserStatus;
use App\Models\Location;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/**
 * Utente visto da chi gestisce gli utenti. Niente ultimo accesso (limite di finalità, spec §7.3), niente dati
 * dell'invito oltre la scadenza. `can` dice quali azioni la policy permette a chi guarda su questa riga: solo il
 * permesso, non lo stato (il frontend li combina, spec del 14/10 §2).
 *
 * @mixin User
 */
final class ManagedUserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        $invitation = $this->status === UserStatus::Invited && $this->relationLoaded('invitation') ? $this->invitation : null;

        return [
            'id' => $this->id,
            'first_name' => $this->first_name,
            'last_name' => $this->last_name,
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'role_label' => $this->role->label(),
            'employment_type' => $this->employment_type->value,
            'employment_type_label' => $this->employment_type->label(),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            // Caricata dai controller: nessuna query qui
            'location' => $this->whenLoaded('location', fn (Location $location): array => ['id' => $location->id, 'name' => $location->name]),
            'invitation_expires_at' => $invitation?->expires_at->toIso8601String(),
            'is_current_user' => $request->user()?->getAuthIdentifier() === $this->id,
            'can' => $this->permissions($request),
        ];
    }

    /**
     * Calcolate dalla policy su ruoli e sedi già caricati: nessuna query per riga.
     *
     * @return array{resend_invitation: bool, cancel_invitation: bool, change_role: bool, disable: bool, enable: bool, update: bool, send_password_reset: bool, change_location: bool, manage_schedule: bool, view_history: bool, manage_absence_types: bool, view_balances: bool, adjust_balances: bool}
     */
    private function permissions(Request $request): array
    {
        $gate = Gate::forUser($request->user());

        return [
            'resend_invitation' => $gate->allows('resendInvitation', $this->resource),
            'cancel_invitation' => $gate->allows('cancelInvitation', $this->resource),
            'change_role' => $gate->allows('changeRole', $this->resource),
            'disable' => $gate->allows('disable', $this->resource),
            'enable' => $gate->allows('enable', $this->resource),
            'update' => $gate->allows('update', $this->resource),
            'send_password_reset' => $gate->allows('sendPasswordReset', $this->resource),
            'change_location' => $gate->allows('changeLocation', $this->resource),
            'manage_schedule' => $gate->allows('manageSchedule', $this->resource),
            'view_history' => $gate->allows('viewHistory', $this->resource),
            'manage_absence_types' => $gate->allows('manageAbsenceTypes', $this->resource),
            'view_balances' => $gate->allows('viewBalances', $this->resource),
            'adjust_balances' => $gate->allows('adjustBalances', $this->resource),
        ];
    }
}
