<?php

namespace App\Http\Requests\Users;

use App\Http\Requests\Concerns\ConfirmsCurrentPassword;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class GrantAdminRequest extends FormRequest
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
            'user_id' => ['required', 'integer', Rule::exists('users', 'id')],
            'current_password' => $this->currentPasswordRules(),
        ];
    }
}
