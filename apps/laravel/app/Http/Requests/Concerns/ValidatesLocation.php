<?php

namespace App\Http\Requests\Concerns;

use App\Models\Location;
use App\Support\PersonRules;
use App\Support\Translate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Nome, città e patrono di una sede (spec §2.1): nome unico senza distinzione di maiuscole (anche tra le archiviate),
 * patrono come giorno e mese insieme, in una data che esiste ogni anno.
 */
trait ValidatesLocation
{
    /**
     * Niente spazi ai lati; la città vuota diventa null.
     */
    protected function normalizeLocation(): void
    {
        $values = [];

        foreach (['name', 'city'] as $field) {
            $value = $this->input($field);

            if (is_string($value)) {
                $trimmed = trim($value);
                $values[$field] = $field === 'city' && $trimmed === '' ? null : $trimmed;
            }
        }

        $this->merge($values);
    }

    /**
     * @return array<string, list<mixed>>
     */
    protected function locationRules(?int $ignoreId): array
    {
        return [
            'name' => [$ignoreId === null ? 'required' : 'sometimes', 'string', 'max:'.Location::NAME_MAX_LENGTH, 'not_regex:'.PersonRules::NAME_FORBIDDEN_CHARACTERS, Rule::unique('locations', 'name')->ignore($ignoreId)],
            'city' => ['sometimes', 'nullable', 'string', 'max:100', 'not_regex:'.PersonRules::NAME_FORBIDDEN_CHARACTERS],
            // Giorno e mese sempre insieme (anche per toglierlo: entrambi null)
            'patron_day' => ['nullable', 'integer', 'between:1,31', 'present_with:patron_month', 'required_with:patron_month'],
            'patron_month' => ['nullable', 'integer', 'between:1,12', 'present_with:patron_day', 'required_with:patron_day'],
        ];
    }

    /**
     * @return array<string, string>
     */
    protected function locationFieldMessages(): array
    {
        return [
            'name.not_regex' => Translate::text('locations.characters'),
            'city.not_regex' => Translate::text('locations.characters'),
        ];
    }

    /**
     * Data valida in un anno non bisestile: il patrono deve esistere ogni anno.
     */
    protected function checkPatron(Validator $validator): void
    {
        $day = $this->input('patron_day');
        $month = $this->input('patron_month');

        if ($validator->errors()->hasAny(['patron_day', 'patron_month']) || ! is_numeric($day) || ! is_numeric($month)) {
            return;
        }

        if (! checkdate((int) $month, (int) $day, 2001)) {
            $validator->errors()->add('patron_day', Translate::text('locations.patron_invalid'));
        }
    }

    /**
     * @return array<string, mixed>
     */
    public function locationData(): array
    {
        return $this->safe()->only(['name', 'city', 'patron_day', 'patron_month']);
    }
}
