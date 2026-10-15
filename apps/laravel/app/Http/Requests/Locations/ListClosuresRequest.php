<?php

namespace App\Http\Requests\Locations;

use App\Support\Holidays\HolidayCalendar;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListClosuresRequest extends FormRequest
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
            'year' => ['required', 'integer', 'between:'.HolidayCalendar::MIN_YEAR.','.HolidayCalendar::MAX_YEAR],
            'filter' => ['sometimes', 'array'],
            'filter.location' => ['sometimes', 'nullable', 'integer', Rule::exists('locations', 'id')],
        ];
    }

    public function locationFilter(): ?int
    {
        return $this->filled('filter.location') ? $this->integer('filter.location') : null;
    }
}
