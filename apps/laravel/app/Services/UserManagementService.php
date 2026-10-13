<?php

namespace App\Services;

use App\Enums\AdminChange;
use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\AdminChangeMail;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Support\AuthSession;
use App\Support\Translate;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;

/**
 * Ruoli e stato degli utenti. Le azioni sugli admin bloccano le righe degli admin attivi:
 * due richieste parallele non possono lasciare l'app senza amministratori.
 */
final class UserManagementService
{
    public function __construct(private readonly AuthEventLogger $events) {}

    public function changeRole(User $target, Role $role, User $actor, Request $request): void
    {
        DB::transaction(function () use ($target, $role, $actor, $request): void {
            $target->forceFill(['role' => $role])->save();
            $this->events->log(AuthEventType::RoleChanged, $request, $target, $actor);
        });
    }

    public function disable(User $target, User $actor, Request $request): void
    {
        DB::transaction(function () use ($target, $actor, $request): void {
            if ($target->isAdmin()) {
                $this->ensureAnAdminRemains($target, $this->lockActiveAdmins($actor));
            }

            $target->forceFill(['status' => UserStatus::Disabled])->save();
            AuthSession::endAllFor($target);
            LoginChallenge::query()->where('user_id', $target->id)->delete();
            DB::table((string) config('auth.passwords.users.table'))->where('email', $target->email)->delete();
            $this->events->log(AuthEventType::UserDisabled, $request, $target, $actor);

            if ($target->isAdmin()) {
                $this->notifyAdmins(AdminChange::Disabled, $target, $actor);
            }
        });
    }

    public function enable(User $target, User $actor, Request $request): void
    {
        DB::transaction(function () use ($target, $actor, $request): void {
            if ($target->isAdmin()) {
                $this->lockActiveAdmins($actor);
            }

            $target->forceFill(['status' => UserStatus::Active])->save();
            $this->events->log(AuthEventType::UserEnabled, $request, $target, $actor);

            if ($target->isAdmin()) {
                $this->notifyAdmins(AdminChange::Enabled, $target, $actor);
            }
        });
    }

    /**
     * Blocca le righe degli admin attivi fino alla fine della transazione e verifica che chi agisce lo sia ancora.
     *
     * @return Collection<int, int>
     */
    private function lockActiveAdmins(User $actor): Collection
    {
        /** @var Collection<int, int> $ids */
        $ids = User::query()
            ->where('role', Role::Admin)
            ->where('status', UserStatus::Active)
            ->lockForUpdate()
            ->pluck('id');

        // Un'altra richiesta può avergli tolto il ruolo dopo il controllo della policy
        if (! $ids->contains($actor->id)) {
            throw new AuthorizationException(Translate::text('users.no_longer_admin'));
        }

        return $ids;
    }

    /**
     * @param  Collection<int, int>  $activeAdminIds
     */
    private function ensureAnAdminRemains(User $target, Collection $activeAdminIds): void
    {
        if ($activeAdminIds->reject(fn (int $id): bool => $id === $target->id)->isEmpty()) {
            throw ValidationException::withMessages(['user' => [Translate::text('users.last_admin')]]);
        }
    }

    /**
     * Email dopo il commit a chi subisce la modifica e agli altri admin attivi (non a chi agisce).
     */
    private function notifyAdmins(AdminChange $change, User $target, User $actor): void
    {
        $occurredAt = now();
        $recipients = User::query()
            ->where('role', Role::Admin)
            ->where('status', UserStatus::Active)
            ->whereKeyNot($actor->id)
            ->get()
            ->push($target)
            ->unique('id')
            ->reject(fn (User $user): bool => $user->is($actor));

        DB::afterCommit(function () use ($recipients, $change, $actor, $target, $occurredAt): void {
            foreach ($recipients as $recipient) {
                // Una coda non raggiungibile non annulla la modifica: l'errore è segnalato
                rescue(fn () => Mail::to($recipient)->send(new AdminChangeMail($change, $actor->name, $target->name, $occurredAt)), report: true);
            }
        });
    }
}
