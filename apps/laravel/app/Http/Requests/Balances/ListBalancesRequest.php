<?php

namespace App\Http\Requests\Balances;

use App\Enums\BalanceOverviewSort;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Ricerca, filtri, ordinamento e pagina della lista Saldi (spec §6.2, §7.2). Valori non validi: 422.
 */
class ListBalancesRequest extends FormRequest
{
    public const PER_PAGE = 25;

    private const SEARCH_MAX_LENGTH = 100;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        $admin = $this->user() instanceof User && $this->user()->isAdmin();

        return [
            'filter' => ['sometimes', 'array'],
            'filter.search' => ['sometimes', 'nullable', 'string', 'max:'.self::SEARCH_MAX_LENGTH],
            'filter.negative' => ['sometimes', 'nullable', 'boolean'],
            // Sede: solo l'admin, il responsabile vede già solo la sua
            'filter.location' => $admin ? ['sometimes', 'nullable', 'integer'] : ['prohibited'],
            'sort' => ['sometimes', 'nullable', Rule::enum(BalanceOverviewSort::class)->except($admin ? [] : [BalanceOverviewSort::Location, BalanceOverviewSort::LocationDesc])],
            'page' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    public function search(): string
    {
        return $this->string('filter.search')->trim()->value();
    }

    public function onlyNegative(): bool
    {
        return $this->boolean('filter.negative');
    }

    public function locationFilter(): ?int
    {
        return $this->filled('filter.location') ? $this->integer('filter.location') : null;
    }

    public function sort(): BalanceOverviewSort
    {
        return $this->enum('sort', BalanceOverviewSort::class) ?? BalanceOverviewSort::Name;
    }
}
