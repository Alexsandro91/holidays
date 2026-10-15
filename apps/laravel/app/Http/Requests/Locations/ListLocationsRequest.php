<?php

namespace App\Http\Requests\Locations;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Schede Attive / Archiviate e ordinamento per nome della lista sedi (spec §4.2). Valori non validi: 422.
 */
class ListLocationsRequest extends FormRequest
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_ARCHIVED = 'archived';

    public const SORT_NAME = 'name';

    public const SORT_NAME_DESC = '-name';

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
            'sort' => ['sometimes', 'nullable', Rule::in([self::SORT_NAME, self::SORT_NAME_DESC])],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    public function wantsArchived(): bool
    {
        return $this->input('filter.status') === self::STATUS_ARCHIVED;
    }

    public function sortDirection(): string
    {
        return $this->input('sort') === self::SORT_NAME_DESC ? 'desc' : 'asc';
    }
}
