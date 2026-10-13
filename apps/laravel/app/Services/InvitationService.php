<?php

namespace App\Services;

use App\Enums\AuthEventType;
use App\Enums\Role;
use App\Enums\UserStatus;
use App\Mail\InvitationMail;
use App\Models\Invitation;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/**
 * Inviti: account creati solo dall'admin, attivati dall'invitato con il link (spec §6.1).
 */
final class InvitationService
{
    public const TTL_HOURS = 72;

    public const RESEND_COOLDOWN_SECONDS = 60;

    private const TOKEN_LENGTH = 64;

    public function __construct(private readonly AuthEventLogger $events) {}

    public function invite(string $name, string $email, Role $role, User $inviter, Request $request): User
    {
        return DB::transaction(function () use ($name, $email, $role, $inviter, $request): User {
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
            $this->events->log(AuthEventType::InvitationSent, $request, $user, $inviter);

            return $user;
        });
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

        DB::afterCommit(fn () => Mail::to($user)->send(new InvitationMail($user->name, $token, $inviter?->name, $expiresAt)));
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
            $this->send($user, $actor);
            $this->events->log(AuthEventType::InvitationSent, $request, $user, $actor);
        });
    }

    /**
     * Annulla l'invito di un utente mai attivato: utente e invito spariscono, resta l'evento con l'autore.
     */
    public function cancel(User $user, User $actor, Request $request): void
    {
        DB::transaction(function () use ($user, $actor, $request): void {
            $user->delete();
            $this->events->log(AuthEventType::InvitationCancelled, $request, null, $actor);
        });
    }

    /**
     * Attiva l'account dell'invitato. Null se un'altra richiesta ha già usato l'invito (riga bloccata).
     */
    public function accept(Invitation $invitation, #[\SensitiveParameter] string $password, Request $request): ?User
    {
        return DB::transaction(function () use ($invitation, $password, $request): ?User {
            $locked = Invitation::query()->with('user')->lockForUpdate()->find($invitation->id);
            $user = $locked?->user;

            if ($locked === null || $locked->isAccepted() || $user === null || $user->status !== UserStatus::Invited) {
                return null;
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

    public function findByToken(#[\SensitiveParameter] string $token): ?Invitation
    {
        return Invitation::query()->with('user')->where('token_hash', self::hashToken($token))->first();
    }

    public static function hashToken(#[\SensitiveParameter] string $token): string
    {
        return hash('sha256', $token);
    }
}
