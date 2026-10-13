<?php

namespace App\Http\Requests\Concerns;

use App\Enums\AuthEventType;
use App\Models\User;
use App\Services\AuthEventLogger;
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
            $this->logPasswordEvent(AuthEventType::AdminPasswordLocked);

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
            $this->logPasswordEvent(AuthEventType::AdminPasswordFailed);
        }

        parent::failedValidation($validator);
    }

    /**
     * Traccia di chi sbaglia la password o resta bloccato: l'admin è sia l'utente sia chi agisce.
     */
    private function logPasswordEvent(AuthEventType $type): void
    {
        $actor = $this->user();

        if ($actor instanceof User) {
            app(AuthEventLogger::class)->log($type, $this, $actor, $actor);
        }
    }

    private function passwordFailuresKey(): string
    {
        return 'admin-password:'.$this->user()?->getAuthIdentifier();
    }
}
