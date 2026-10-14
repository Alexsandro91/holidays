<?php

namespace App\Services;

use App\Enums\AdminChange;
use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\AdminChangeMail;
use App\Models\LoginChallenge;
use App\Models\User;
use App\Services\Concerns\RechecksUserPermissions;
use App\Support\AuthSession;
use App\Support\Translate;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

/**
 * Ruoli e stato degli utenti. Ogni azione blocca prima le righe degli admin attivi (stesso ordine ovunque),
 * poi chi agisce e infine il destinatario: due richieste parallele non possono lasciare l'app senza amministratori
 * e i permessi si ricontrollano sulle righe rilette.
 */
final class UserManagementService
{
    use RechecksUserPermissions;

    public function __construct(
        private readonly AuthEventLogger $events,
        private readonly InvitationService $invitations,
    ) {}

    public function changeRole(User $target, Role $role, User $actor, Request $request): User
    {
        // Il ruolo admin si dà solo dalla sezione amministratori: lo garantisce la request, il servizio lo riverifica
        if ($role === Role::Admin) {
            throw new InvalidArgumentException('The admin role cannot be set by a role change.');
        }

        return DB::transaction(function () use ($target, $role, $actor, $request): User {
            $this->lockActiveAdminIds();
            $freshActor = $this->lockUserManager($actor);
            $fresh = User::query()->lockForUpdate()->findOrFail($target->id);

            // Un admin non cambia ruolo da qui: nel frattempo può essere stato promosso
            if ($fresh->isAdmin()) {
                throw new ConflictHttpException(Translate::text('users.state_changed'));
            }

            $this->ensureStillAllowed('changeRole', $freshActor, $fresh);

            $fresh->forceFill(['role' => $role])->save();
            $this->events->log(AuthEventType::RoleChanged, $request, $fresh, $actor);

            return $fresh;
        });
    }

    /**
     * @param  bool  $expectAdmin  se il bersaglio era un admin quando la richiesta è stata validata (decide la password)
     */
    public function disable(User $target, User $actor, Request $request, bool $expectAdmin): User
    {
        return DB::transaction(function () use ($target, $actor, $request, $expectAdmin): User {
            $activeAdminIds = $this->lockActiveAdminIds();
            $freshActor = $this->lockUserManager($actor);
            $fresh = $this->lockFreshTarget($target, $expectAdmin);
            $this->ensureStillAllowed('disable', $freshActor, $fresh);

            if ($fresh->status !== UserStatus::Active) {
                throw new ConflictHttpException(Translate::text('users.not_active'));
            }

            if ($fresh->isAdmin()) {
                $this->ensureAnAdminRemains($fresh, $activeAdminIds);
            }

            $fresh->forceFill(['status' => UserStatus::Disabled])->save();
            AuthSession::endAllFor($fresh);
            LoginChallenge::query()->where('user_id', $fresh->id)->delete();
            DB::table((string) config('auth.passwords.users.table'))->where('email', $fresh->email)->delete();
            $this->events->log(AuthEventType::UserDisabled, $request, $fresh, $actor);

            if ($fresh->isAdmin()) {
                $this->notifyAdmins(AdminChange::Disabled, $fresh, $actor);
            }

            return $fresh;
        });
    }

    /**
     * @param  bool  $expectAdmin  se il bersaglio era un admin quando la richiesta è stata validata (decide la password)
     */
    public function enable(User $target, User $actor, Request $request, bool $expectAdmin): User
    {
        return DB::transaction(function () use ($target, $actor, $request, $expectAdmin): User {
            $this->lockActiveAdminIds();
            $freshActor = $this->lockUserManager($actor);
            $fresh = $this->lockFreshTarget($target, $expectAdmin);
            $this->ensureStillAllowed('enable', $freshActor, $fresh);

            if ($fresh->status !== UserStatus::Disabled) {
                throw new ConflictHttpException(Translate::text('users.not_disabled'));
            }

            $fresh->forceFill(['status' => UserStatus::Active])->save();
            $this->events->log(AuthEventType::UserEnabled, $request, $fresh, $actor);

            if ($fresh->isAdmin()) {
                $this->notifyAdmins(AdminChange::Enabled, $fresh, $actor);
            }

            return $fresh;
        });
    }

    public function grantAdmin(User $target, User $actor, Request $request): User
    {
        return DB::transaction(function () use ($target, $actor, $request): User {
            $this->lockActiveAdmins($actor);
            $fresh = User::query()->lockForUpdate()->findOrFail($target->id);

            // Nel frattempo il bersaglio può essere stato promosso o disattivato
            if ($fresh->status !== UserStatus::Active || $fresh->isAdmin()) {
                throw new ConflictHttpException(Translate::text('users.not_promotable'));
            }

            $fresh->forceFill(['role' => Role::Admin])->save();
            $this->events->log(AuthEventType::AdminGranted, $request, $fresh, $actor);
            $this->notifyAdmins(AdminChange::Granted, $fresh, $actor);

            return $fresh;
        });
    }

    /**
     * Invita un nuovo admin (spec del 14/10, §4): utente admin invitato, evento admin_invited ed email agli altri
     * admin attivi dopo il commit. L'invitato riceve solo l'invito.
     */
    public function inviteAdmin(string $name, string $email, User $actor, Request $request): User
    {
        return DB::transaction(function () use ($name, $email, $actor, $request): User {
            $this->lockActiveAdmins($actor);
            $invited = $this->invitations->inviteAdmin($name, $email, $actor, $request);
            $this->notifyAdmins(AdminChange::Invited, $invited, $actor, notifyTarget: false);

            return $invited;
        });
    }

    /**
     * Revoca il ruolo admin: il nuovo ruolo è solo dipendente o responsabile. Lo garantiscono già request e policy,
     * il servizio lo riverifica perché può essere chiamato anche fuori da HTTP.
     */
    public function revokeAdmin(User $target, Role $newRole, User $actor, Request $request): User
    {
        if ($newRole === Role::Admin) {
            throw new InvalidArgumentException('The new role of a revoked admin cannot be admin.');
        }

        if ($target->is($actor)) {
            throw new AuthorizationException(Translate::text('users.not_on_yourself'));
        }

        return DB::transaction(function () use ($target, $newRole, $actor, $request): User {
            $activeAdminIds = $this->lockActiveAdmins($actor);
            $fresh = User::query()->lockForUpdate()->findOrFail($target->id);

            if (! $fresh->isAdmin()) {
                throw new ConflictHttpException(Translate::text('users.not_admin'));
            }

            $this->ensureAnAdminRemains($fresh, $activeAdminIds);

            $fresh->forceFill(['role' => $newRole])->save();
            $this->events->log(AuthEventType::AdminRevoked, $request, $fresh, $actor);
            $this->notifyAdmins(AdminChange::Revoked, $fresh, $actor);

            return $fresh;
        });
    }

    /**
     * Chi agisce, bloccato e riletto dopo gli admin attivi: un'altra richiesta può avergli tolto il ruolo
     * o l'account dopo il controllo della policy.
     */
    private function lockUserManager(User $actor): User
    {
        return $this->ensureStillManagesUsers(User::query()->lockForUpdate()->find($actor->id));
    }

    private function lockFreshTarget(User $target, bool $expectAdmin): User
    {
        $fresh = User::query()->lockForUpdate()->findOrFail($target->id);

        // La password è stata chiesta (o no) in base al ruolo letto prima del blocco
        if ($fresh->isAdmin() !== $expectAdmin) {
            throw new ConflictHttpException(Translate::text('users.state_changed'));
        }

        return $fresh;
    }

    /**
     * Blocca le righe degli admin attivi fino alla fine della transazione.
     *
     * @return Collection<int, int>
     */
    private function lockActiveAdminIds(): Collection
    {
        /** @var Collection<int, int> $ids */
        $ids = User::query()
            ->where('role', Role::Admin)
            ->where('status', UserStatus::Active)
            ->lockForUpdate()
            ->pluck('id');

        return $ids;
    }

    /**
     * Per le azioni riservate agli admin: blocca gli admin attivi e verifica che chi agisce lo sia ancora.
     *
     * @return Collection<int, int>
     */
    private function lockActiveAdmins(User $actor): Collection
    {
        $ids = $this->lockActiveAdminIds();

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
     * Email dopo il commit agli altri admin attivi e, se richiesto, a chi subisce la modifica (mai a chi agisce).
     */
    private function notifyAdmins(AdminChange $change, User $target, User $actor, bool $notifyTarget = true): void
    {
        $occurredAt = now();
        $recipients = User::query()
            ->where('role', Role::Admin)
            ->where('status', UserStatus::Active)
            ->whereKeyNot($actor->id)
            ->get()
            ->when($notifyTarget, fn (Collection $admins): Collection => $admins->push($target))
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
