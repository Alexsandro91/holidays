<?php

namespace App\Http\Resources;

use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Utente visto dall'admin. Niente ultimo accesso (limite di finalità, spec §7.3), niente dati dell'invito oltre la scadenza.
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
            'name' => $this->name,
            'email' => $this->email,
            'role' => $this->role->value,
            'role_label' => $this->role->label(),
            'status' => $this->status->value,
            'status_label' => $this->status->label(),
            'invitation_expires_at' => $invitation?->expires_at->toIso8601String(),
            'is_current_user' => $request->user()?->getAuthIdentifier() === $this->id,
        ];
    }
}
