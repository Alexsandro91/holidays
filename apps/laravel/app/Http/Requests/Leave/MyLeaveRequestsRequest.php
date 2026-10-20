<?php

namespace App\Http\Requests\Leave;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Le mie richieste: anno facoltativo (quelle che toccano l'anno), pagina.
 */
class MyLeaveRequestsRequest extends FormRequest
{
    public const FIRST_YEAR = 2000;

    public const LAST_YEAR = 2100;

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
            'year' => ['sometimes', 'nullable', 'integer', 'between:'.self::FIRST_YEAR.','.self::LAST_YEAR],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    public function year(): ?int
    {
        return $this->filled('year') ? (int) $this->validated('year') : null;
    }
}
