<?php

namespace App\Http\Requests\AbsenceTypes;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Schede Attivi / Archiviati della lista dei tipi (spec §3.3). Valore non valido: 422.
 */
class ListAbsenceTypesRequest extends FormRequest
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_ARCHIVED = 'archived';

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
            'filter' => ['sometimes', 'array'],
            'filter.status' => ['sometimes', 'nullable', Rule::in([self::STATUS_ACTIVE, self::STATUS_ARCHIVED])],
        ];
    }

    public function wantsArchived(): bool
    {
        return $this->input('filter.status') === self::STATUS_ARCHIVED;
    }
}
