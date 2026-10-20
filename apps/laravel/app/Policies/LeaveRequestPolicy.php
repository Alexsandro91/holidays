<?php

namespace App\Policies;

use App\Enums\Role;
use App\Models\LeaveRequest;
use App\Models\User;

/**
 * Chi può fare cosa su una richiesta di assenza (spec §6). Solo ruoli e sedi già caricati, nessuna query: la richiesta
 * deve avere `user` caricato. Lo stato e il "prima che inizi" li controllano servizi e resource.
 */
final class LeaveRequestPolicy
{
    /**
     * Chi l'ha chiesta e chi può deciderla.
     */
    public function view(User $actor, LeaveRequest $request): bool
    {
        return $this->owns($actor, $request) || $this->decide($actor, $request);
    }

    /**
     * Approvatori: l'admin su chiunque (anche su sé stesso); il responsabile sulle persone non admin della sua sede,
     * sé compreso.
     */
    public function decide(User $actor, LeaveRequest $request): bool
    {
        if ($actor->isAdmin()) {
            return true;
        }

        /** @var User $owner */
        $owner = $request->user;

        return $actor->role === Role::Manager && ! $owner->isAdmin() && $owner->location_id === $actor->location_id;
    }

    public function withdraw(User $actor, LeaveRequest $request): bool
    {
        return $this->owns($actor, $request);
    }

    public function requestCancellation(User $actor, LeaveRequest $request): bool
    {
        return $this->owns($actor, $request);
    }

    private function owns(User $actor, LeaveRequest $request): bool
    {
        return $request->user_id === $actor->id;
    }
}
