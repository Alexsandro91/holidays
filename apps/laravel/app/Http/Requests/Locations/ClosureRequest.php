<?php

namespace App\Http\Requests\Locations;

use App\Models\Closure as CompanyClosure;
use App\Support\PersonRules;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Chiusura nuova o modificata (spec §2.4): al massimo 31 giorni, mai finita prima di cominciare. Nella modifica
 * l'intervallo si controlla con le date che non cambiano.
 */
class ClosureRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $description = $this->input('description');

        if (is_string($description)) {
            $this->merge(['description' => trim($description)]);
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $creating = $this->closure() === null;
        $required = $creating ? 'required' : 'sometimes';

        return [
            // Nella creazione la chiave serve sempre: null vuol dire "tutte le sedi", detto esplicitamente
            'location_id' => [$creating ? 'present' : 'sometimes', 'nullable', 'integer', Rule::exists('locations', 'id')],
            'starts_on' => [$required, 'date_format:Y-m-d'],
            'ends_on' => [$required, 'date_format:Y-m-d'],
            'description' => [$required, 'string', 'max:'.CompanyClosure::DESCRIPTION_MAX_LENGTH, 'not_regex:'.PersonRules::NAME_FORBIDDEN_CHARACTERS],
        ];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->hasAny(['starts_on', 'ends_on'])) {
                return;
            }

            $start = $this->input('starts_on', $this->closure()?->starts_on->toDateString());
            $end = $this->input('ends_on', $this->closure()?->ends_on->toDateString());

            if (! is_string($start) || ! is_string($end)) {
                return;
            }

            if ($end < $start) {
                $validator->errors()->add('ends_on', Translate::text('locations.closure_order'));

                return;
            }

            if ((int) CarbonImmutable::parse($start)->diffInDays(CarbonImmutable::parse($end)) + 1 > CompanyClosure::MAX_DAYS) {
                $validator->errors()->add('ends_on', Translate::text('locations.closure_too_long', ['days' => CompanyClosure::MAX_DAYS]));
            }
        }];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return ['description.not_regex' => Translate::text('locations.characters')];
    }

    /**
     * @return array<string, mixed>
     */
    public function closureData(): array
    {
        return $this->safe()->only(['location_id', 'starts_on', 'ends_on', 'description']);
    }

    private function closure(): ?CompanyClosure
    {
        $closure = $this->route('closure');

        return $closure instanceof CompanyClosure ? $closure : null;
    }
}
