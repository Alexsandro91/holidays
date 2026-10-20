<?php

namespace App\Policies;

use App\Models\User;

/**
 * Valori annui dell'azienda: solo l'admin (spec §4.1). Sede e persona seguono LocationPolicy e UserPolicy.
 */
final class AccrualSettingPolicy
{
    public function manage(User $actor): bool
    {
        return $actor->isAdmin();
    }
}
