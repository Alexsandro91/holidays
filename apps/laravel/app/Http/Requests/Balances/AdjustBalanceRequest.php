<?php

namespace App\Http\Requests\Balances;

use App\Enums\BalanceType;
use App\Models\BalanceMovement;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Rettifica (spec §5.1): saldo, minuti con segno diversi da 0, motivo obbligatorio.
 */
class AdjustBalanceRequest extends FormRequest
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
            'balance' => ['required', Rule::enum(BalanceType::class)],
            'minutes' => [
                'required',
                'integer',
                'between:-'.BalanceMovement::MAX_CORRECTION_MINUTES.','.BalanceMovement::MAX_CORRECTION_MINUTES,
                Rule::notIn([0]),
            ],
            'note' => ['required', 'string', 'max:'.BalanceMovement::NOTE_MAX_LENGTH],
        ];
    }

    public function balance(): BalanceType
    {
        return BalanceType::from((string) $this->validated('balance'));
    }

    public function minutes(): int
    {
        return (int) $this->validated('minutes');
    }

    public function note(): string
    {
        return (string) $this->validated('note');
    }
}
