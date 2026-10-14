<?php

namespace App\Http\Requests\Profile;

use App\Http\Middleware\SetLocale;
use App\Http\Requests\Concerns\ValidatesInvitee;
use App\Support\PersonRules;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Profilo (fase 4, §2.2): nome, cognome e lingua di chi fa la richiesta. Nessuna password, nessuna policy.
 */
class UpdateProfileRequest extends FormRequest
{
    use ValidatesInvitee;

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
            'first_name' => ['sometimes', ...PersonRules::name()],
            'last_name' => ['sometimes', ...PersonRules::name()],
            'locale' => ['sometimes', 'string', Rule::in(SetLocale::SUPPORTED)],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return $this->inviteeMessages();
    }
}
