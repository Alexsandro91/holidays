<?php

namespace App\Http\Requests\Users;

use App\Enums\Role;
use App\Support\Translate;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StoreUserRequest extends FormRequest
{
    /**
     * Caratteri vietati nel nome: finisce nelle email markdown (link o HTML iniettati) e nei log.
     */
    public const NAME_FORBIDDEN_CHARACTERS = '/[\p{Cc}\[\]<>]/u';

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $email = $this->input('email');
        $name = $this->input('name');

        $this->merge(array_filter([
            'email' => is_string($email) ? Str::lower(trim($email)) : null,
            'name' => is_string($name) ? trim($name) : null,
        ], fn (?string $value): bool => $value !== null));
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255', 'not_regex:'.self::NAME_FORBIDDEN_CHARACTERS],
            'email' => ['required', 'string', 'email', 'max:255', Rule::unique('users', 'email')],
            // Gli admin nascono solo per promozione (decisione della fase 3)
            'role' => ['required', Rule::enum(Role::class)->only([Role::Employee, Role::Manager])],
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
