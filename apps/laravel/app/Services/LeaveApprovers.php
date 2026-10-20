<?php

namespace App\Services;

use App\Enums\LeaveRequestStatus;
use App\Enums\LeaveSource;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Models\LeaveRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

/**
 * Chi approva cosa: la lista di Da approvare, il contatore e i destinatari delle email.
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

    /**
     * Destinatari degli avvisi su una richiesta (spec §7.4): i responsabili attivi della sede della persona, lei esclusa;
     * se non ce ne sono (o se la persona è un admin) gli altri admin attivi.
     *
     * @return Collection<int, User>
     */
    public function notifyRecipients(LeaveRequest $request): Collection
    {
        $person = $request->user;

        if (! $person->isAdmin()) {
            $managers = User::query()
                ->where('role', Role::Manager)
                ->where('status', UserStatus::Active)
                ->where('location_id', $person->location_id)
                ->whereKeyNot($person->id)
                ->orderBy('id')
                ->get();

            if ($managers->isNotEmpty()) {
                return $managers;
            }
        }

        return User::query()
            ->where('role', Role::Admin)
            ->where('status', UserStatus::Active)
            ->whereKeyNot($person->id)
            ->orderBy('id')
            ->get();
    }
}
