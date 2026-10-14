<?php

namespace App\Http\Requests\Concerns;

use App\Support\PersonRules;

/**
 * Nome, cognome ed email di chi si invita: stesse regole per l'invito normale, quello di un nuovo admin e la modifica.
 *
 * Il trait non definisce `messages()`: la FormRequest deve restituire `inviteeMessages()` dal suo `messages()`,
 * altrimenti i testi sui caratteri vietati tornerebbero quelli generici.
 */
trait ValidatesInvitee
{
    /**
     * Email in minuscolo, nome e cognome senza spazi ai lati, prima della validazione.
     */
    protected function normalizeInvitee(): void
    {
        $values = [];

        foreach (['first_name', 'last_name', 'email'] as $field) {
            $value = $this->input($field);

            if (is_string($value)) {
                $values[$field] = $field === 'email' ? PersonRules::normalizeEmail($value) : trim($value);
            }
        }

        $this->merge($values);
    }

    /**
     * @return array<string, list<mixed>>
     */
    protected function inviteeRules(?int $ignoreUserId = null): array
    {
        return [
            'first_name' => PersonRules::name(),
            'last_name' => PersonRules::name(),
            'email' => PersonRules::email($ignoreUserId),
        ];
    }

    /**
     * @return array<string, string>
     */
    protected function inviteeMessages(): array
    {
        return PersonRules::messages();
    }
}
