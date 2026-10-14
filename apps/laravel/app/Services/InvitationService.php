<?php

namespace App\Services;

use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\InvitationMail;
use App\Models\Invitation;
use App\Models\User;
use App\Services\Concerns\RechecksUserPermissions;
use App\Services\Concerns\RejectsDuplicateEmail;
use App\Support\Translate;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use InvalidArgumentException;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;
use Symfony\Component\HttpKernel\Exception\GoneHttpException;

/**
 * Inviti: account creati solo dall'admin, attivati dall'invitato con il link (spec §6.1).
 */
final class InvitationService
{
    use RechecksUserPermissions, RejectsDuplicateEmail;

    public const TTL_HOURS = 72;

    public const RESEND_COOLDOWN_SECONDS = 60;

    private const TOKEN_LENGTH = 64;

    public function __construct(private readonly AuthEventLogger $events) {}

    /**
     * Invito di un dipendente o di un responsabile.
     */
    public function invite(string $name, string $email, Role $role, User $inviter, Request $request): User
    {
        // Un nuovo admin passa solo da inviteAdmin(): blocco degli admin, evento ed email agli admin dedicati
        if ($role === Role::Admin) {
            throw new InvalidArgumentException('Admins are invited only through UserManagementService::inviteAdmin().');
        }

        return $this->rejectingDuplicateEmail($email, fn (): User => DB::transaction(function () use ($name, $email, $role, $inviter, $request): User {
            $user = $this->createInvited($name, $email, $role, $inviter);
            $this->events->log(AuthEventType::InvitationSent, $request, $user, $inviter);

            return $user;
        }));
    }

    /**
     * Invito di un nuovo admin (spec del 14/10, §4). Da chiamare solo da UserManagementService::inviteAdmin(),
     * che dentro la stessa transazione blocca gli admin attivi, verifica chi agisce e avvisa gli altri admin.
     */
    public function inviteAdmin(string $name, string $email, User $inviter, Request $request): User
    {
        return DB::transaction(function () use ($name, $email, $inviter, $request): User {
            $user = $this->createInvited($name, $email, Role::Admin, $inviter);
            $this->events->log(AuthEventType::AdminInvited, $request, $user, $inviter);

            return $user;
        });
    }

    private function createInvited(string $name, string $email, Role $role, User $inviter): User
    {
        $user = new User;
        $user->forceFill([
            'name' => $name,
            'email' => $email,
            'password' => null,
            'role' => $role,
            'status' => UserStatus::Invited,
            'locale' => app()->getLocale(),
        ])->save();

        $this->send($user, $inviter);

        return $user;
    }

    /**
     * Nuovo token (il precedente smette di valere) e email in coda dopo il commit.
     */
    public function send(User $user, ?User $inviter): void
    {
        $token = Str::random(self::TOKEN_LENGTH);
        $expiresAt = now()->addHours(self::TTL_HOURS);

        Invitation::query()->updateOrCreate(['user_id' => $user->id], [
            'token_hash' => self::hashToken($token),
            'invited_by' => $inviter?->id,
            'expires_at' => $expiresAt,
            'accepted_at' => null,
            'last_sent_at' => now(),
        ]);

        // Una coda non raggiungibile non annulla l'invito: l'errore è segnalato e l'admin può reinviare
        DB::afterCommit(fn () => rescue(
            fn () => Mail::to($user)->send(new InvitationMail($user->name, $token, $inviter?->name, $expiresAt)),
            report: true,
        ));
    }

    public function secondsUntilResend(User $user): int
    {
        $lastSentAt = $user->invitation?->last_sent_at;

        if ($lastSentAt === null) {
            return 0;
        }

        return max(0, (int) ceil(now()->diffInSeconds($lastSentAt->copy()->addSeconds(self::RESEND_COOLDOWN_SECONDS))));
    }

    public function resend(User $user, User $actor, Request $request): void
    {
        DB::transaction(function () use ($user, $actor, $request): void {
            $fresh = $this->lockPendingInvitation($user);
            $this->ensureStillAllowed('resendInvitation', $actor, $this->freshActor($actor), $fresh);
            $this->send($fresh, $actor);
            $this->events->log(AuthEventType::InvitationSent, $request, $fresh, $actor);
        });
    }

    /**
     * Annulla l'invito di un utente mai attivato: utente e invito spariscono, resta l'evento con l'autore.
     */
    public function cancel(User $user, User $actor, Request $request): void
    {
        DB::transaction(function () use ($user, $actor, $request): void {
            $fresh = $this->lockPendingInvitation($user);
            $this->ensureStillAllowed('cancelInvitation', $actor, $this->freshActor($actor), $fresh);
            $fresh->delete();
            $this->events->log(AuthEventType::InvitationCancelled, $request, null, $actor);
        });
    }

    /**
     * Attiva l'account dell'invitato. Null se nel frattempo il link è stato usato, sostituito da un reinvio
     * o annullato; GoneHttpException (410) se è scaduto. Lo stato si rilegge sulle righe bloccate.
     */
    public function accept(Invitation $invitation, #[\SensitiveParameter] string $password, Request $request): ?User
    {
        return DB::transaction(function () use ($invitation, $password, $request): ?User {
            // Stesso ordine di blocco di annullamento e reinvio: prima l'invito, poi l'utente
            $locked = Invitation::query()->where('token_hash', $invitation->token_hash)->lockForUpdate()->first();
            $user = $locked === null ? null : User::query()->lockForUpdate()->find($locked->user_id);

            if ($locked === null || $locked->isAccepted() || $user === null || $user->status !== UserStatus::Invited) {
                return null;
            }

            if ($locked->isExpired()) {
                throw new GoneHttpException(Translate::text('invitations.expired'));
            }

            $user->forceFill([
                'password' => $password,
                'status' => UserStatus::Active,
                'email_verified_at' => now(),
                'privacy_notice_version' => (string) config('app.privacy_notice_version'),
                'privacy_notice_acknowledged_at' => now(),
            ])->save();
            $locked->forceFill(['accepted_at' => now()])->save();
            $this->events->log(AuthEventType::InvitationAccepted, $request, $user);

            return $user;
        });
    }

    /**
     * Blocca l'invito e poi l'utente (stesso ordine di accept(), niente deadlock) e verifica che l'invito
     * sia ancora in attesa: il controllo del controller è fatto su un'istanza non bloccata.
     */
    private function lockPendingInvitation(User $user): User
    {
        $invitation = Invitation::query()->where('user_id', $user->id)->lockForUpdate()->first();
        $fresh = User::query()->lockForUpdate()->find($user->id);

        if ($fresh === null || $fresh->status !== UserStatus::Invited || $invitation?->isAccepted() === true) {
            throw new ConflictHttpException(Translate::text('invitations.not_invited'));
        }

        return $fresh;
    }

    /**
     * Chi agisce, riletto senza blocco: bloccarlo dopo invito e utente invertirebbe l'ordine dei blocchi
     * del servizio di gestione utenti (admin, attore, destinatario) e rischierebbe un deadlock.
     */
    private function freshActor(User $actor): User
    {
        return $this->ensureStillManagesUsers(User::query()->find($actor->id));
    }

    public function findByToken(#[\SensitiveParameter] string $token): ?Invitation
    {
        return Invitation::query()->with('user')->where('token_hash', self::hashToken($token))->first();
    }

    public static function hashToken(#[\SensitiveParameter] string $token): string
    {
        return hash('sha256', $token);
    }
}
