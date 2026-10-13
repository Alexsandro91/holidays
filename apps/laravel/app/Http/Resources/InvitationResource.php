<?php

namespace App\Http\Resources;

use App\Models\Invitation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Invito visto dall'invitato prima dell'attivazione: solo chi è invitato e fino a quando (mai token né autore).
 *
 * @mixin Invitation
 */
final class InvitationResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        // L'utente è caricato da InvitationService::findByToken()
        return [
            'name' => $this->whenLoaded('user', fn (): ?string => $this->user?->name),
            'email' => $this->whenLoaded('user', fn (): ?string => $this->user?->email),
            'expires_at' => $this->expires_at->toIso8601String(),
        ];
    }
}
