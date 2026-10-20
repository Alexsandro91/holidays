<?php

namespace App\Http\Requests\Balances;

use App\Enums\BalanceType;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Valori annui di una sede o di una persona: le tre chiavi ci sono sempre, `null` = eredita (spec §4.1).
 */
class UpdateAccrualOverrideRequest extends FormRequest
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
        $rules = [];

        foreach (BalanceType::cases() as $balance) {
            $rules[$balance->settingColumn()] = ['present', 'nullable', 'integer', 'min:0', 'max:'.UpdateCompanyAccrualRequest::MAX_MINUTES];
        }

        return $rules;
    }

    /**
     * @return array<string, int|null>
     */
    public function values(): array
    {
        $values = [];

        foreach (BalanceType::cases() as $balance) {
            $value = $this->validated($balance->settingColumn());
            $values[$balance->settingColumn()] = $value === null ? null : (int) $value;
        }

        return $values;
    }
}
