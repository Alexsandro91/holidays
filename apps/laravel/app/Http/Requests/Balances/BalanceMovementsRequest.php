<?php

namespace App\Http\Requests\Balances;

use App\Enums\BalanceType;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\Rule;

/**
 * Filtri dei movimenti: saldo e anno, entrambi facoltativi (senza anno, tutti gli anni).
 */
class BalanceMovementsRequest extends BalanceYearRequest
{
    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            ...parent::rules(),
            'balance' => ['sometimes', 'nullable', Rule::enum(BalanceType::class)],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    public function balance(): ?BalanceType
    {
        return $this->filled('balance') ? BalanceType::from((string) $this->validated('balance')) : null;
    }

    public function yearFilter(): ?int
    {
        return $this->filled('year') ? $this->year() : null;
    }
}
