<?php

namespace App\Http\Resources;

use App\Enums\UserStatus;
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
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'invitation_expires_at' => $invitation?->expires_at->toIso8601String(),
            'is_current_user' => $request->user()?->getAuthIdentifier() === $this->id,
            'can' => $this->permissions($request),
        ];
    }

    /**
     * Calcolate dalla policy sui ruoli già caricati: nessuna query per riga.
     *
     * @return array{resend_invitation: bool, cancel_invitation: bool, change_role: bool, disable: bool, enable: bool}
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
        ];
    }
}
