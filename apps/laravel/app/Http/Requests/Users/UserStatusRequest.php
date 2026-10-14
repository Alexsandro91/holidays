<?php

namespace App\Http\Requests\Users;

use App\Http\Requests\Concerns\ConfirmsCurrentPassword;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Disattivare, riattivare o inviare il link di reset a un admin chiede la password di chi agisce; per gli altri utenti basta la conferma in UI.
 */
class UserStatusRequest extends FormRequest
{
    use ConfirmsCurrentPassword;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        if ($this->targetIsAdmin()) {
            $this->ensurePasswordNotLockedOut();
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return $this->targetIsAdmin() ? ['current_password' => $this->currentPasswordRules()] : [];
    }

    private function targetIsAdmin(): bool
    {
        $target = $this->route('user');

        return $target instanceof User && $target->isAdmin();
    }
}
