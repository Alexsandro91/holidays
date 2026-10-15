<?php

namespace App\Http\Requests\Locations;

use App\Http\Requests\Concerns\ValidatesLocation;
use App\Models\Location;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class UpdateLocationRequest extends FormRequest
{
    use ValidatesLocation;

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $this->normalizeLocation();
    }

    /**
     * Il nome della sede stessa non conta come doppione.
     *
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $location = $this->route('location');

        assert($location instanceof Location);

        return $this->locationRules($location->id);
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [fn (Validator $validator) => $this->checkPatron($validator)];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return $this->locationFieldMessages();
    }
}
