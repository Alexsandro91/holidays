<?php

namespace App\Http\Requests\Balances;

use Carbon\CarbonImmutable;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Giorno dell'anteprima di "Allinea alla busta paga": i saldi nell'app a quella data.
 */
class BalancesAtRequest extends FormRequest
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
            'date' => ['required', 'date_format:Y-m-d', 'after_or_equal:'.BalanceYearRequest::FIRST_YEAR.'-01-01'],
        ];
    }

    public function day(): CarbonImmutable
    {
        return CarbonImmutable::parse((string) $this->validated('date'))->startOfDay();
    }
}
