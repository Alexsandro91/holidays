<?php

namespace App\Http\Requests\AbsenceTypes;

use App\Support\Translate;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Nuovo elenco di abilitazioni di una persona (spec §3.4): solo tipi attivi che richiedono abilitazione.
 */
class SyncEnablementsRequest extends FormRequest
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
            'absence_type_ids' => ['present', 'array', 'max:200'],
            'absence_type_ids.*' => [
                'integer',
                'distinct',
                Rule::exists('absence_types', 'id')->where('requires_enablement', true)->whereNull('archived_at'),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return ['absence_type_ids.*.exists' => Translate::text('absence_types.not_enablement')];
    }

    /**
     * @return list<int>
     */
    public function typeIds(): array
    {
        return array_values(array_map(intval(...), $this->validated('absence_type_ids')));
    }
}
