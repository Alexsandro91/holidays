<?php

namespace App\Http\Requests\Balances;

use App\Enums\BalanceType;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Valori annui dell'azienda: tutti e tre obbligatori, da 0 a 60000 minuti (spec §4.1).
 */
class UpdateCompanyAccrualRequest extends FormRequest
{
    public const MAX_MINUTES = 60000;

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
            $rules[$balance->settingColumn()] = ['required', 'integer', 'min:0', 'max:'.self::MAX_MINUTES];
        }

        return $rules;
    }

    /**
     * @return array<string, int>
     */
    public function values(): array
    {
        $values = [];

        foreach (BalanceType::cases() as $balance) {
            $values[$balance->settingColumn()] = (int) $this->validated($balance->settingColumn());
        }

        return $values;
    }
}
