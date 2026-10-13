<?php

namespace App\Http\Requests\Invitations;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class AcceptInvitationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            // max: un testo enorme renderebbe costoso l'hash Argon2id
            'password' => ['required', 'string', 'max:255', 'confirmed', Password::defaults()],
            'password_confirmation' => ['required', 'string'],
            // Presa visione dell'informativa (non è un consenso: base giuridica art. 6.1.b)
            'privacy_acknowledged' => ['accepted'],
        ];
    }
}
