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
 *
 * Attenzione: il trait implementa `passedValidation()` e `failedValidation()` per restituire il tentativo prenotato
 * da `ensurePasswordNotLockedOut()`. Una FormRequest che li ridefinisce sostituisce in silenzio quelli del trait:
 * deve chiamare `releasePasswordAttempt()` (e in `failedValidation()` contare l'errore come fa il trait), altrimenti
 * ogni azione riuscita consuma un tentativo e dopo 5 azioni corrette l'admin resta bloccato.
 */
trait ConfirmsCurrentPassword
{
    private const MAX_PASSWORD_FAILURES = 5;

    private const PASSWORD_FAILURE_DECAY_SECONDS = 900;

    /** Tentativo prenotato da questa richiesta, da restituire se la password non risulta sbagliata. */
    private bool $passwordAttemptReserved = false;

    /**
     * @return list<string>
     */
    protected function currentPasswordRules(): array
    {
        return ['required', 'string', 'current_password:web'];
    }

    /**
     * Prenota il tentativo prima di verificare la password: l'incremento è atomico e il valore che restituisce
     * decide il blocco, così anche richieste parallele non superano i 5 errori. Il campo vuoto non prenota.
     */
    protected function ensurePasswordNotLockedOut(): void
    {
        $key = $this->passwordFailuresKey();

        if (! $this->filled('current_password')) {
            if (RateLimiter::tooManyAttempts($key, self::MAX_PASSWORD_FAILURES)) {
                $this->throwPasswordLockout($key);
            }

            return;
        }

        if (RateLimiter::increment($key, self::PASSWORD_FAILURE_DECAY_SECONDS) > self::MAX_PASSWORD_FAILURES) {
            // Richiesta respinta senza verificare la password: il tentativo non conta
            RateLimiter::decrement($key, self::PASSWORD_FAILURE_DECAY_SECONDS);
            $this->throwPasswordLockout($key);
        }

        $this->passwordAttemptReserved = true;
    }

    /**
     * Evento registrato per la password sbagliata: una FormRequest lo ridefinisce se il flusso non è quello degli admin.
     */
    protected function passwordFailedEvent(): AuthEventType
    {
        return AuthEventType::AdminPasswordFailed;
    }

    /**
     * Evento registrato per il blocco dopo troppi errori (ridefinibile come `passwordFailedEvent()`).
     */
    protected function passwordLockedEvent(): AuthEventType
    {
        return AuthEventType::AdminPasswordLocked;
    }

    protected function failedValidation(Validator $validator): void
    {
        if ($this->passwordAttemptReserved && $validator->errors()->has('current_password')) {
            // Password sbagliata: il tentativo prenotato resta contato
            $this->passwordAttemptReserved = false;
            $this->logPasswordEvent($this->passwordFailedEvent());
        } else {
            $this->releasePasswordAttempt();
        }

        parent::failedValidation($validator);
    }

    protected function passedValidation(): void
    {
        $this->releasePasswordAttempt();

        parent::passedValidation();
    }

    /**
     * Password giusta: il tentativo prenotato si restituisce, le azioni riuscite non consumano tentativi.
     */
    protected function releasePasswordAttempt(): void
    {
        if (! $this->passwordAttemptReserved) {
            return;
        }

        $this->passwordAttemptReserved = false;
        $key = $this->passwordFailuresKey();

        // Senza errori né altre prenotazioni il contatore sparisce: la finestra di 15 minuti
        // deve partire dal primo errore, non da un'azione riuscita
        if (RateLimiter::decrement($key, self::PASSWORD_FAILURE_DECAY_SECONDS) <= 0) {
            RateLimiter::clear($key);
        }
    }

    private function throwPasswordLockout(string $key): never
    {
        $seconds = RateLimiter::availableIn($key);
        $this->logPasswordEvent($this->passwordLockedEvent());

        throw new ThrottleRequestsException(
            Translate::text('users.password_locked', ['minutes' => (int) ceil($seconds / 60)]),
            null,
            ['Retry-After' => (string) $seconds],
        );
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
