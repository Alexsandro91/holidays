<?php

namespace App\Http\Requests\Concerns;

use App\Support\Translate;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Nome ed email di chi si invita: stesse regole per l'invito normale e per quello di un nuovo admin.
 */
trait ValidatesInvitee
{
    /**
     * Caratteri vietati nel nome: finisce nelle email markdown (link o HTML iniettati) e nei log.
     */
    public const NAME_FORBIDDEN_CHARACTERS = '/[\p{Cc}\[\]<>]/u';

    /**
     * Email in minuscolo e nome senza spazi ai lati, prima della validazione.
     */
    protected function normalizeInvitee(): void
    {
        $email = $this->input('email');
        $name = $this->input('name');

        $this->merge(array_filter([
            'email' => is_string($email) ? Str::lower(trim($email)) : null,
            'name' => is_string($name) ? trim($name) : null,
        ], fn (?string $value): bool => $value !== null));
    }

    /**
     * @return array{name: list<string>, email: list<mixed>}
     */
    protected function inviteeRules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255', 'not_regex:'.self::NAME_FORBIDDEN_CHARACTERS],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return ['name.not_regex' => Translate::text('users.name_characters')];
    }
}
