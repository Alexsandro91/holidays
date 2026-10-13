<?php

namespace App\Http\Requests\Concerns;

use App\Support\Translate;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Password dell'admin per le azioni sugli amministratori: dopo 5 errori in 15 minuti le azioni si bloccano (429).
 */
trait ConfirmsCurrentPassword
{
    private const MAX_PASSWORD_FAILURES = 5;

    private const PASSWORD_FAILURE_DECAY_SECONDS = 900;

    /**
     * @return list<string>
     */
    protected function currentPasswordRules(): array
    {
        return ['required', 'string', 'current_password:web'];
    }

    protected function ensurePasswordNotLockedOut(): void
    {
        $key = $this->passwordFailuresKey();

        if (RateLimiter::tooManyAttempts($key, self::MAX_PASSWORD_FAILURES)) {
            $seconds = RateLimiter::availableIn($key);

            throw new ThrottleRequestsException(
                Translate::text('users.password_locked', ['minutes' => (int) ceil($seconds / 60)]),
                null,
                ['Retry-After' => (string) $seconds],
            );
        }
    }

    protected function failedValidation(Validator $validator): void
    {
        // Contano solo le password sbagliate, non il campo lasciato vuoto
        if ($this->filled('current_password') && $validator->errors()->has('current_password')) {
            RateLimiter::hit($this->passwordFailuresKey(), self::PASSWORD_FAILURE_DECAY_SECONDS);
        }

        parent::failedValidation($validator);
    }

    private function passwordFailuresKey(): string
    {
        return 'admin-password:'.$this->user()?->getAuthIdentifier();
    }
}
