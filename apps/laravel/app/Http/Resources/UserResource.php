<?php

namespace App\Http\Resources;

use App\Models\Location;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin User
 */
class UserResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
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
            'location' => $this->whenLoaded('location', fn (Location $location): array => ['id' => $location->id, 'name' => $location->name]),
            'locale' => $this->locale,
            'last_login_at' => $this->last_login_at?->toIso8601String(),
        ];
    }
}
