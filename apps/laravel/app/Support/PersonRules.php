<?php

namespace App\Support;

use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Unique;

/**
 * Regole di nome, cognome ed email di una persona: le stesse per invito, invito admin, modifica e `app:create-admin`.
 */
final class PersonRules
{
    /**
     * Caratteri vietati in nome e cognome: finiscono nelle email markdown (link o HTML iniettati) e nei log.
     */
    public const NAME_FORBIDDEN_CHARACTERS = '/[\p{Cc}\[\]<>]/u';

    /**
     * @return list<string>
     */
    public static function name(): array
    {
        return ['required', 'string', 'max:255', 'not_regex:'.self::NAME_FORBIDDEN_CHARACTERS];
    }

    /**
     * @return list<string|Unique>
     */
    public static function email(?int $ignoreUserId = null): array
    {
        return ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($ignoreUserId)];
    }

    /**
     * @return array<string, string>
     */
    public static function messages(): array
    {
        return [
            'first_name.not_regex' => Translate::text('users.name_characters'),
            'last_name.not_regex' => Translate::text('users.last_name_characters'),
        ];
    }

    public static function normalizeEmail(string $email): string
    {
        return Str::lower(trim($email));
    }
}
