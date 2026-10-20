<?php

namespace App\Policies;

use App\Enums\Role;
use App\Models\User;

/**
 * Chi può agire su chi nella gestione utenti (spec del 14/10, §2). Il responsabile gestisce gli utenti come l'admin,
 * tranne gli admin e le persone delle altre sedi; gli amministratori li gestisce solo l'admin. Lo stato del destinatario (invitato, attivo…)
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
        return $this->mayActOn($actor, $target) && ! $actor->is($target) && ! $target->isAdmin();
    }

    public function disable(User $actor, User $target): bool
    {
        return $this->mayActOn($actor, $target) && ! $actor->is($target);
    }

    /**
     * Link di reset della password a un utente attivo: stesse regole di `disable` (mai su sé stessi, per sé c'è il profilo).
     */
    public function sendPasswordReset(User $actor, User $target): bool
    {
        return $this->mayActOn($actor, $target) && ! $actor->is($target);
    }

    public function enable(User $actor, User $target): bool
    {
        return $this->mayActOn($actor, $target);
    }

    /**
     * Nome, cognome ed email: l'admin su chiunque, il responsabile su chi non è admin ed è nella sua sede, sé stessi compresi.
     */
    public function update(User $actor, User $target): bool
    {
        return $this->mayActOn($actor, $target);
    }

    /**
     * Spostare una persona di sede: solo l'admin (spec §4.5).
     */
    public function changeLocation(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    /**
     * Orario personale: solo l'admin (spec §4.4).
     */
    public function manageSchedule(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    /**
     * Abilitazioni ai tipi di assenza: solo l'admin (spec §3.4).
     */
    public function manageAbsenceTypes(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    /**
     * Valori annui di maturazione di una persona: solo l'admin (spec §4.1).
     */
    public function manageAccrual(User $actor, User $target): bool
    {
        return $actor->isAdmin();
    }

    /**
     * Storico di una persona: chi può agire su di lei (spec §8.3).
     */
    public function viewHistory(User $actor, User $target): bool
    {
        return $this->mayActOn($actor, $target);
    }

    /**
     * Saldi di una persona: chi può agire su di lei (spec §6.1); il responsabile non vede quelli di un admin.
     */
    public function viewBalances(User $actor, User $target): bool
    {
        return $this->mayActOn($actor, $target);
    }

    /**
     * Rettifiche e allineamenti: come la vista, ma nessuno corregge i propri saldi (spec §6.1).
     */
    public function adjustBalances(User $actor, User $target): bool
    {
        return $this->mayActOn($actor, $target) && ! $actor->is($target);
    }

    /**
     * Pagina Saldi: responsabile o admin (spec §6.1). Quali persone vede lo decide `User::visibleTo`.
     */
    public function viewBalanceOverview(User $actor): bool
    {
        return $this->managesUsers($actor);
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
     * L'admin agisce su chiunque. Il responsabile solo su chi non è admin ed è nella sua sede (spec §4.1): confronta
     * le sedi già caricate, nessuna query.
     */
    private function mayActOn(User $actor, User $target): bool
    {
        if (! $this->managesUsers($actor)) {
            return false;
        }

        return $actor->isAdmin() || (! $target->isAdmin() && $actor->location_id === $target->location_id);
    }
}
