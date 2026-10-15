<?php

namespace App\Http\Requests\Users;

use App\Enums\Role;
use App\Http\Requests\Concerns\ChoosesLocationAndType;
use App\Http\Requests\Concerns\ValidatesInvitee;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreUserRequest extends FormRequest
{
    use ChoosesLocationAndType, ValidatesInvitee;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->normalizeInvitee();
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            ...$this->inviteeRules(),
            ...$this->locationAndTypeRules(),
            // Un nuovo admin si invita solo dalla sezione Amministratori (InviteAdminRequest)
            'role' => ['required', Rule::enum(Role::class)->only([Role::Employee, Role::Manager])],
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
