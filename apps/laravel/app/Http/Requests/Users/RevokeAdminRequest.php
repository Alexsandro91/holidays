<?php

namespace App\Http\Requests\Users;

use App\Enums\Role;
use App\Http\Requests\Concerns\ConfirmsCurrentPassword;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RevokeAdminRequest extends FormRequest
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

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'role' => ['required', Rule::enum(Role::class)->only([Role::Employee, Role::Manager])],
            'current_password' => $this->currentPasswordRules(),
        ];
    }
}
