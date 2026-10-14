<?php

namespace App\Services\Concerns;

use Closure;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Due richieste con la stessa email superano entrambe la regola `unique` della request: la seconda viola l'indice
 * unico. Va intercettata fuori dalla transazione più esterna (su alcuni database la transazione fallita resta
 * inutilizzabile) e diventa lo stesso 422 su `email` della validazione, non un 500 (spec del 14/10, §7.5).
 */
trait RejectsDuplicateEmail
{
    /**
     * @template TResult
     *
     * @param  Closure(): TResult  $callback
     * @return TResult
     */
    private function rejectingDuplicateEmail(string $email, Closure $callback, ?int $ignoreUserId = null): mixed
    {
        try {
            return $callback();
        } catch (UniqueConstraintViolationException $exception) {
            // Stesso messaggio della regola unique; se non risulta duplicata è un altro vincolo e l'errore resta
            Validator::make(['email' => $email], ['email' => [Rule::unique('users', 'email')->ignore($ignoreUserId)]])->validate();

            throw $exception;
        }
    }
}
