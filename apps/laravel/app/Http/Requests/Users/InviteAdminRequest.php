<?php

namespace App\Http\Requests\Users;

use App\Http\Requests\Concerns\ChoosesLocationAndType;
use App\Http\Requests\Concerns\ConfirmsCurrentPassword;
use App\Http\Requests\Concerns\ValidatesInvitee;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Invito di un nuovo admin (spec del 14/10, §4): nome, cognome, email, sede e tipo come l'invito normale, più la password
 * di chi agisce.
 */
class InviteAdminRequest extends FormRequest
{
    use ChoosesLocationAndType, ConfirmsCurrentPassword, ValidatesInvitee;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->normalizeInvitee();
        $this->ensurePasswordNotLockedOut();
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            ...$this->inviteeRules(),
            ...$this->locationAndTypeRules(),
            'current_password' => $this->currentPasswordRules(),
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [...$this->inviteeMessages(), ...$this->locationMessages()];
    }
}
