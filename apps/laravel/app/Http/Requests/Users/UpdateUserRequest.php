<?php

namespace App\Http\Requests\Users;

use App\Enums\UserStatus;
use App\Http\Requests\Concerns\ValidatesInvitee;
use App\Models\User;
use App\Support\Translate;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Modifica di nome, cognome ed email (spec del 14/10, §7.3). L'email cambia solo per chi è ancora invitato:
 * dopo l'attivazione è l'indirizzo con cui la persona accede.
 */
class UpdateUserRequest extends FormRequest
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
        $rules = $this->inviteeRules($this->target()->id);

        return [...$rules, 'email' => ['sometimes', ...$rules['email']]];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            $email = $this->input('email');
            $target = $this->target();

            if (is_string($email) && $email !== $target->email && $target->status !== UserStatus::Invited && ! $validator->errors()->has('email')) {
                $validator->errors()->add('email', Translate::text('users.email_locked'));
            }
        }];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return $this->inviteeMessages();
    }

    /**
     * Email aggiornata solo se diversa da quella attuale; null se non va cambiata.
     */
    public function newEmail(): ?string
    {
        $email = $this->validated('email');

        return is_string($email) && $email !== $this->target()->email ? $email : null;
    }

    private function target(): User
    {
        $target = $this->route('user');

        assert($target instanceof User);

        return $target;
    }
}
