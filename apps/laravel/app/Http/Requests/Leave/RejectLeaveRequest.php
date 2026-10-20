<?php

namespace App\Http\Requests\Leave;

use App\Models\LeaveRequest;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Rifiuto di una richiesta: motivo facoltativo (spec §6). Il permesso lo controlla la rotta (`decide`).
 */
class RejectLeaveRequest extends FormRequest
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
            'decision_note' => ['sometimes', 'nullable', 'string', 'max:'.LeaveRequest::NOTE_MAX_LENGTH],
        ];
    }

    public function note(): ?string
    {
        $note = $this->validated('decision_note');

        return is_string($note) && $note !== '' ? $note : null;
    }
}
