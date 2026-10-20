<?php

namespace App\Http\Requests\Balances;

use App\Models\Location;
use App\Models\User;
use App\Services\WorkScheduleService;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Anno del riepilogo dei saldi (spec §5.3): dal 2000 all'anno in corso nel fuso della sede della persona (quella
 * dell'indirizzo, o chi è collegato nel profilo). Senza anno vale quello in corso.
 */
class BalanceYearRequest extends FormRequest
{
    public const FIRST_YEAR = 2000;

    private ?int $currentYear = null;

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
            'year' => ['sometimes', 'integer', 'min:'.self::FIRST_YEAR, 'max:'.$this->currentYear()],
        ];
    }

    public function year(): int
    {
        return $this->filled('year') ? (int) $this->validated('year') : $this->currentYear();
    }

    /**
     * Persona di cui si leggono i saldi.
     */
    public function person(): User
    {
        $person = $this->route('user') ?? $this->user();

        assert($person instanceof User);

        return $person;
    }

    private function currentYear(): int
    {
        return $this->currentYear ??= app(WorkScheduleService::class)
            ->today(Location::query()->findOrFail($this->person()->location_id))
            ->year;
    }
}
