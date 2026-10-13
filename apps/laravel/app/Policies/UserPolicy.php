<?php

namespace App\Policies;

use App\Models\User;

/**
 * Chi può agire su chi nella gestione utenti. Lo stato del bersaglio (invitato, attivo…) lo controllano i controller.
 */
final class UserPolicy
{
    public function viewAny(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function create(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function resendInvitation(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    public function cancelInvitation(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    public function changeRole(User $actor, User $target): bool
    {
        // Il ruolo admin si gestisce solo dalla sezione amministratori
        return $actor->isAdmin() && ! $actor->is($target) && ! $target->isAdmin();
    }

    public function disable(User $actor, User $target): bool
    {
        return $actor->isAdmin() && ! $actor->is($target);
    }

    public function enable(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    public function grantAdmin(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    public function revokeAdmin(User $actor, User $target): bool
    {
        return $actor->isAdmin() && ! $actor->is($target);
    }
}
