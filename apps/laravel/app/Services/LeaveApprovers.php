<?php

namespace App\Services;

use App\Enums\LeaveRequestStatus;
use App\Enums\LeaveSource;
use App\Enums\Role;
use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Chi approva cosa: la lista di Da approvare e il contatore (i destinatari delle email arrivano con il Task 7).
 */
final class LeaveApprovers
{
    /**
     * Richieste e annullamenti in attesa che l'attore può decidere (stessa regola di `LeaveRequestPolicy::decide`):
     * l'admin tutte, il responsabile quelle delle persone non admin della sua sede, sé compreso. Solo `source = request`
     * (le chiusure aziendali non si approvano). Le richieste di chi è disattivato non restano in attesa (spec §4).
     *
     * @return Builder<LeaveRequest>
     */
    public function pendingQuery(User $actor): Builder
    {
        $query = LeaveRequest::query()
            ->where('source', LeaveSource::Request)
            ->whereIn('status', [LeaveRequestStatus::Pending, LeaveRequestStatus::CancellationRequested]);

        if ($actor->isAdmin()) {
            return $query;
        }

        if ($actor->role !== Role::Manager) {
            return $query->whereRaw('1 = 0');
        }

        return $query->whereHas('user', fn (Builder $user) => $user
            ->where('role', '!=', Role::Admin)
            ->where('location_id', $actor->location_id));
    }

    public function pendingCount(User $actor): int
    {
        return $this->pendingQuery($actor)->count();
    }
}
