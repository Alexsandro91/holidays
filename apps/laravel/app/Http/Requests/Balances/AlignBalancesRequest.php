<?php

namespace App\Http\Requests\Balances;

use App\Enums\BalanceType;
use App\Models\BalanceMovement;
use App\Support\Translate;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Allineamento alla busta paga (spec §5.2): data della busta paga e, per ciascun saldo, un valore facoltativo in minuti
 * (anche negativo); almeno uno. "Non futura" e "non prima dell'ultimo allineamento" li controlla il servizio, sotto
 * blocco e nel fuso della sede.
 */
class AlignBalancesRequest extends FormRequest
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
        $rules = [
            'aligned_on' => ['required', 'date_format:Y-m-d', 'after_or_equal:'.BalanceYearRequest::FIRST_YEAR.'-01-01'],
            'values' => ['sometimes', 'array:'.implode(',', $this->balanceKeys())],
            'note' => ['nullable', 'string', 'max:'.BalanceMovement::NOTE_MAX_LENGTH],
        ];

        foreach ($this->balanceKeys() as $key) {
            $rules["values.{$key}"] = [
                'nullable',
                'integer',
                'between:-'.BalanceMovement::MAX_CORRECTION_MINUTES.','.BalanceMovement::MAX_CORRECTION_MINUTES,
            ];
        }

        return $rules;
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator): void {
            if ($validator->errors()->has('values') || $validator->errors()->has('values.*')) {
                return;
            }

            $values = $this->input('values');
            $given = is_array($values) ? array_filter($values, fn (mixed $value): bool => $value !== null) : [];

            if ($given === []) {
                $validator->errors()->add('values', Translate::text('balances.alignment_empty'));
            }
        }];
    }

    public function alignedOn(): CarbonImmutable
    {
        return CarbonImmutable::parse((string) $this->validated('aligned_on'))->startOfDay();
    }

    /**
     * Valori indicati, nell'ordine dei saldi.
     *
     * @return array<string, int>
     */
    public function values(): array
    {
        $values = [];

        foreach ($this->balanceKeys() as $key) {
            $value = $this->validated("values.{$key}");

            if ($value !== null) {
                $values[$key] = (int) $value;
            }
        }

        return $values;
    }

    public function note(): ?string
    {
        $note = $this->validated('note');

        return $note === null ? null : (string) $note;
    }

    /**
     * @return list<string>
     */
    private function balanceKeys(): array
    {
        return array_map(fn (BalanceType $balance): string => $balance->value, BalanceType::cases());
    }
}
