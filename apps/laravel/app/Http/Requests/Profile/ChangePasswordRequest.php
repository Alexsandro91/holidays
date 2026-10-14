<?php

namespace App\Http\Requests\Profile;

use App\Enums\AuthEventType;
use App\Http\Requests\Concerns\ConfirmsCurrentPassword;
use App\Support\Translate;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rules\Password;

/**
 * Cambio della propria password (fase 4, §2.3). Stesso blocco delle azioni degli admin (contatore condiviso),
 * con gli eventi del profilo.
 */
class ChangePasswordRequest extends FormRequest
{
    use ConfirmsCurrentPassword;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->ensurePasswordNotLockedOut();
    }

    protected function passwordFailedEvent(): AuthEventType
    {
        return AuthEventType::PasswordChangeFailed;
    }

    protected function passwordLockedEvent(): AuthEventType
    {
        return AuthEventType::PasswordChangeLocked;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'current_password' => $this->currentPasswordRules(),
            'password' => [
                'required', 'string', 'max:255', 'confirmed', Password::defaults(),
                function (string $attribute, mixed $value, Closure $fail): void {
                    $current = $this->user()?->getAuthPassword();

                    if (is_string($value) && is_string($current) && Hash::check($value, $current)) {
                        $fail(Translate::text('profile.password_unchanged'));
                    }
                },
            ],
        ];
    }
}
