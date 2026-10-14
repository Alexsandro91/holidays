<?php

namespace App\Http\Requests\Profile;

use App\Enums\AuthEventType;
use App\Http\Requests\Concerns\ConfirmsCurrentPassword;
use App\Support\Translate;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Contracts\Validation\Validator;
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
            'password' => ['required', 'string', 'max:255', 'confirmed', Password::defaults()],
        ];
    }

    /**
     * "Diversa dall'attuale" si controlla solo con la password attuale verificata: altrimenti il confronto direbbe
     * se una password candidata è quella giusta, senza consumare tentativi.
     *
     * @return list<Closure(Validator): void>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->hasAny(['current_password', 'password'])) {
                    return;
                }

                $current = $this->user()?->getAuthPassword();
                $password = $this->input('password');

                if (is_string($password) && is_string($current) && Hash::check($password, $current)) {
                    $validator->errors()->add('password', Translate::text('profile.password_unchanged'));
                }
            },
        ];
    }
}
