<?php

namespace App\Policies;

use App\Models\Location;
use App\Models\User;

/**
 * Sezione Sedi: solo l'admin (spec §1, §4.2). Orari e calendario seguono i permessi della sede.
 */
final class LocationPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function view(User $actor, Location $location): bool
    {
        return $actor->isAdmin();
    }

    public function create(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function update(User $actor, Location $location): bool
    {
        return $actor->isAdmin();
    }
}
