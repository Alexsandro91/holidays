<?php

namespace App\Policies;

use App\Enums\Role;
use App\Models\User;

/**
 * Chi può agire su chi nella gestione utenti (spec del 14/10, §2). Il responsabile gestisce gli utenti come l'admin,
 * tranne gli admin; gli amministratori li gestisce solo l'admin. Lo stato del destinatario (invitato, attivo…)
 * lo controllano controller e servizi: qui contano solo i ruoli, senza query.
 */
final class UserPolicy
{
    public function viewAny(User $actor): bool
    {
        return $this->managesUsers($actor);
    }

    public function create(User $actor): bool
    {
        return $this->managesUsers($actor);
    }

    /**
     * Sezione Amministratori: lista, promozione, invito e revoca degli admin.
     */
    public function manageAdministrators(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function resendInvitation(User $actor, User $target): bool
    {
        return $this->mayActOn($actor, $target);
    }

    public function cancelInvitation(User $actor, User $target): bool
    {
        return $this->mayActOn($actor, $target);
    }

    public function changeRole(User $actor, User $target): bool
    {
        // Il ruolo admin si gestisce solo dalla sezione amministratori
        return $this->managesUsers($actor) && ! $actor->is($target) && ! $target->isAdmin();
    }

    public function disable(User $actor, User $target): bool
    {
        return $this->mayActOn($actor, $target) && ! $actor->is($target);
    }

    public function enable(User $actor, User $target): bool
    {
        return $this->mayActOn($actor, $target);
    }

    /**
     * Nome, cognome ed email: l'admin su chiunque, il responsabile su chi non è admin, sé stessi compresi.
     */
    public function update(User $actor, User $target): bool
    {
        return $this->mayActOn($actor, $target);
    }

    public function grantAdmin(User $actor, User $target): bool
    {
        return $this->manageAdministrators($actor);
    }

    public function revokeAdmin(User $actor, User $target): bool
    {
        return $this->manageAdministrators($actor) && ! $actor->is($target);
    }

    private function managesUsers(User $actor): bool
    {
        return in_array($actor->role, [Role::Manager, Role::Admin], true);
    }

    /**
     * Un admin come destinatario lo gestisce solo un altro admin.
     */
    private function mayActOn(User $actor, User $target): bool
    {
        return $this->managesUsers($actor) && ($actor->isAdmin() || ! $target->isAdmin());
    }
}
