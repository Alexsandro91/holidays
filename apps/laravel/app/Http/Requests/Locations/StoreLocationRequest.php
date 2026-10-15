<?php

namespace App\Http\Requests\Locations;

use App\Http\Requests\Concerns\ValidatesLocation;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreLocationRequest extends FormRequest
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
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return $this->locationRules(null);
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
