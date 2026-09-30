<?php

namespace App\Services;

use App\Enums\ChallengeResult;
use App\Models\LoginChallenge;
use App\Models\User;

/**
 * Codice di 6 cifre inviato via email a ogni login: generazione, verifica, nuovo invio.
 */
final class LoginChallengeService
{
    public const TTL_MINUTES = 10;

    public const MAX_ATTEMPTS = 5;

    public const MAX_RESENDS = 3;

    public const RESEND_COOLDOWN_SECONDS = 60;

    /**
     * @return array{0: LoginChallenge, 1: string}
     */
    public function start(User $user): array
    {
        LoginChallenge::query()->where('user_id', $user->id)->delete();

        $code = $this->generateCode();

        $challenge = LoginChallenge::query()->create([
            'user_id' => $user->id,
            'code_hash' => $this->hash($code),
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
            'attempts' => 0,
            'resend_count' => 0,
            'last_sent_at' => now(),
        ]);

        return [$challenge, $code];
    }

    public function verify(LoginChallenge $challenge, string $code): ChallengeResult
    {
        if ($challenge->expires_at->isPast()) {
            $challenge->delete();

            return ChallengeResult::Expired;
        }

        if ($challenge->attempts >= self::MAX_ATTEMPTS) {
            $challenge->delete();

            return ChallengeResult::Locked;
        }

        if (hash_equals($challenge->code_hash, $this->hash($code))) {
            $challenge->delete();

            return ChallengeResult::Valid;
        }

        $challenge->increment('attempts');

        if ($challenge->attempts >= self::MAX_ATTEMPTS) {
            $challenge->delete();

            return ChallengeResult::Locked;
        }

        return ChallengeResult::Invalid;
    }

    public function attemptsLeft(LoginChallenge $challenge): int
    {
        return max(0, self::MAX_ATTEMPTS - $challenge->attempts);
    }

    public function secondsUntilResend(LoginChallenge $challenge): int
    {
        $availableAt = $challenge->last_sent_at->copy()->addSeconds(self::RESEND_COOLDOWN_SECONDS);

        return max(0, (int) ceil(now()->diffInSeconds($availableAt)));
    }

    public function canResend(LoginChallenge $challenge): bool
    {
        return $challenge->resend_count < self::MAX_RESENDS;
    }

    /**
     * Sostituisce il codice (il precedente non vale più) e riparte da zero con tentativi e scadenza.
     */
    public function resend(LoginChallenge $challenge): string
    {
        $code = $this->generateCode();

        $challenge->update([
            'code_hash' => $this->hash($code),
            'expires_at' => now()->addMinutes(self::TTL_MINUTES),
            'attempts' => 0,
            'resend_count' => $challenge->resend_count + 1,
            'last_sent_at' => now(),
        ]);

        return $code;
    }

    private function generateCode(): string
    {
        return str_pad((string) random_int(0, 999_999), 6, '0', STR_PAD_LEFT);
    }

    private function hash(string $code): string
    {
        return hash_hmac('sha256', $code, (string) config('app.key'));
    }
}
