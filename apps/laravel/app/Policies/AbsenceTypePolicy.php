<?php

namespace App\Policies;

use App\Models\User;

/**
 * Tipi di assenza: solo l'admin (spec §3.3).
 */
final class AbsenceTypePolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function create(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function update(User $actor): bool
    {
        return $actor->isAdmin();
    }
}
