<?php

namespace App\Http\Requests\AbsenceTypes;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Nuovo ordine dei tipi attivi (spec §3.3). Che l'elenco coincida con i tipi attivi lo verifica il servizio, sotto lock.
 */
class ReorderAbsenceTypesRequest extends FormRequest
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
            'ids' => ['required', 'array', 'max:200'],
            'ids.*' => ['integer', 'distinct'],
        ];
    }

    /**
     * @return list<int>
     */
    public function ids(): array
    {
        return array_values(array_map(intval(...), $this->validated('ids')));
    }
}
