<?php

namespace App\Http\Requests\AbsenceTypes;

use App\Enums\AbsenceDayCount;
use App\Enums\AbsenceLimitPeriod;
use App\Enums\AbsenceLimitUnit;
use App\Enums\BalanceType;
use App\Enums\EmploymentType;
use App\Models\AbsenceType;
use App\Support\Translate;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * Creazione (POST) e modifica (PATCH) di un tipo di assenza, regole di spec §3.1. Il `code` non si legge mai dal body.
 * In modifica i campi sono facoltativi e le regole tra campi si valutano sui valori che il tipo avrà dopo la modifica.
 */
class AbsenceTypeRequest extends FormRequest
{
    private const BOOLEANS = ['allows_days', 'allows_half_days', 'allows_hours', 'requires_approval', 'requires_enablement', 'requires_certificate'];

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $name = $this->input('name');

        if (is_string($name)) {
            $this->merge(['name' => trim($name)]);
        }
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $current = $this->currentType();
        $presence = $current === null ? 'required' : 'sometimes';

        // I tipi di partenza ripristinano il nome tradotto con `null`; quelli personalizzati hanno sempre un nome
        $name = $current?->isSystem() === true
            ? ['sometimes', 'nullable']
            : [$presence];

        $rules = [
            'name' => [...$name, 'string', 'max:'.AbsenceType::NAME_MAX_LENGTH, Rule::unique('absence_types', 'name')->ignore($current?->id)],
            'balance' => ['sometimes', 'nullable', Rule::enum(BalanceType::class)],
            'employment_types' => [$presence, 'array', 'min:1'],
            'employment_types.*' => ['distinct', Rule::enum(EmploymentType::class)],
            'day_count' => [$presence, Rule::enum(AbsenceDayCount::class)],
            'limit' => ['sometimes', 'nullable', 'array'],
            'limit.amount' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'limit.unit' => ['nullable', Rule::enum(AbsenceLimitUnit::class)],
            'limit.period' => ['nullable', Rule::enum(AbsenceLimitPeriod::class)],
        ];

        foreach (self::BOOLEANS as $field) {
            $rules[$field] = [$presence, 'boolean'];
        }

        return $rules;
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return ['name.unique' => Translate::text('absence_types.name_taken')];
    }

    /**
     * @return list<callable(Validator): void>
     */
    public function after(): array
    {
        return [
            fn (Validator $validator) => $this->checkUnits($validator),
            fn (Validator $validator) => $this->checkBalance($validator),
            fn (Validator $validator) => $this->checkLimit($validator),
            fn (Validator $validator) => $this->checkTranslatedName($validator),
        ];
    }

    /**
     * Colonne da scrivere: solo campi validati, con il limite appiattito nelle tre colonne.
     *
     * @return array<string, mixed>
     */
    public function typeData(): array
    {
        $data = $this->safe()->except(['limit']);

        if ($this->safe()->has('limit')) {
            $limit = $this->safe()->input('limit');

            $data['limit_amount'] = is_array($limit) ? ($limit['amount'] ?? null) : null;
            $data['limit_unit'] = is_array($limit) ? ($limit['unit'] ?? null) : null;
            $data['limit_period'] = is_array($limit) ? ($limit['period'] ?? null) : null;
        }

        return $data;
    }

    private function currentType(): ?AbsenceType
    {
        $type = $this->route('absenceType');

        return $type instanceof AbsenceType ? $type : null;
    }

    /**
     * Valore che il campo avrà dopo la richiesta: quello inviato, altrimenti quello del tipo.
     */
    private function effective(string $field): mixed
    {
        return $this->safe()->has($field) ? $this->safe()->input($field) : $this->currentType()?->getAttribute($field);
    }

    private function checkUnits(Validator $validator): void
    {
        if ($validator->errors()->hasAny(['allows_days', 'allows_half_days', 'allows_hours'])) {
            return;
        }

        $days = (bool) $this->effective('allows_days');
        $half = (bool) $this->effective('allows_half_days');
        $hours = (bool) $this->effective('allows_hours');

        if (! $days && ! $half && ! $hours) {
            $validator->errors()->add('allows_days', Translate::text('absence_types.unit_required'));
        }

        if ($half && ! $days) {
            $validator->errors()->add('allows_half_days', Translate::text('absence_types.half_days_need_days'));
        }
    }

    private function checkBalance(Validator $validator): void
    {
        if ($validator->errors()->hasAny(['balance', 'employment_types', 'employment_types.*'])) {
            return;
        }

        $balance = $this->effective('balance');
        $types = $this->effective('employment_types');

        if ($balance !== null && is_array($types) && array_diff($types, [EmploymentType::Employee->value]) !== []) {
            $validator->errors()->add('employment_types', Translate::text('absence_types.balance_employees_only'));
        }
    }

    /**
     * Quantità, unità e periodo: tutti o nessuno.
     */
    private function checkLimit(Validator $validator): void
    {
        $limit = $this->safe()->input('limit');

        if (! is_array($limit) || $validator->errors()->hasAny(['limit', 'limit.amount', 'limit.unit', 'limit.period'])) {
            return;
        }

        $filled = count(array_filter([$limit['amount'] ?? null, $limit['unit'] ?? null, $limit['period'] ?? null], fn (mixed $value): bool => $value !== null));

        if ($filled !== 0 && $filled !== 3) {
            $validator->errors()->add('limit.amount', Translate::text('absence_types.limit_incomplete'));
        }
    }

    /**
     * Il nome non può coincidere con quello tradotto di un tipo di partenza non rinominato (lingua della richiesta).
     */
    private function checkTranslatedName(Validator $validator): void
    {
        $name = $this->safe()->input('name');

        if (! is_string($name) || $validator->errors()->has('name')) {
            return;
        }

        $taken = AbsenceType::query()
            ->whereNull('name')
            ->whereNotNull('code')
            ->when($this->currentType() !== null, fn ($query) => $query->whereKeyNot($this->currentType()?->id))
            ->get()
            ->contains(fn (AbsenceType $type): bool => mb_strtolower($type->displayName()) === mb_strtolower($name));

        if ($taken) {
            $validator->errors()->add('name', Translate::text('absence_types.name_taken'));
        }
    }
}
