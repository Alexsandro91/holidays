<?php

namespace App\Http\Requests\Users;

use App\Enums\EmploymentType;
use App\Enums\Role;
use App\Enums\UserSort;
use App\Enums\UserStatus;
use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Ricerca, filtri, ordinamento e paginazione della lista utenti (spec del 14/10, §3 e §7.2). Valori non validi: 422.
 */
class ListUsersRequest extends FormRequest
{
    public const PER_PAGE_OPTIONS = [10, 25, 50];

    public const DEFAULT_PER_PAGE = 25;

    private const FILTER_MAX_LENGTH = 100;

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
            'filter' => ['sometimes', 'array'],
            'filter.search' => ['sometimes', 'nullable', 'string', 'max:'.self::FILTER_MAX_LENGTH],
            'filter.first_name' => ['sometimes', 'nullable', 'string', 'max:'.self::FILTER_MAX_LENGTH],
            'filter.last_name' => ['sometimes', 'nullable', 'string', 'max:'.self::FILTER_MAX_LENGTH],
            'filter.email' => ['sometimes', 'nullable', 'string', 'max:'.self::FILTER_MAX_LENGTH],
            'filter.role' => ['sometimes', 'nullable', Rule::enum(Role::class)->only([Role::Employee, Role::Manager])],
            'filter.status' => ['sometimes', 'nullable', Rule::enum(UserStatus::class)],
            'filter.employment_type' => ['sometimes', 'nullable', Rule::enum(EmploymentType::class)],
            // Sede: solo l'admin, il responsabile vede già solo la sua (spec §4.5)
            'filter.location' => $this->actorIsAdmin() ? ['sometimes', 'nullable', 'integer'] : ['prohibited'],
            'sort' => ['sometimes', 'nullable', Rule::enum(UserSort::class)->except($this->actorIsAdmin() ? [] : [UserSort::Location, UserSort::LocationDesc])],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', Rule::in(self::PER_PAGE_OPTIONS)],
        ];
    }

    /**
     * Testo di un filtro "contiene" (search, first_name, last_name o email), senza spazi ai lati; vuoto se assente.
     */
    public function textFilter(string $key): string
    {
        return $this->string("filter.{$key}")->trim()->value();
    }

    public function sort(): UserSort
    {
        return $this->enum('sort', UserSort::class) ?? UserSort::LastName;
    }

    public function perPage(): int
    {
        return $this->integer('per_page', self::DEFAULT_PER_PAGE);
    }

    public function locationFilter(): ?int
    {
        return $this->filled('filter.location') ? $this->integer('filter.location') : null;
    }

    private function actorIsAdmin(): bool
    {
        $user = $this->user();

        return $user instanceof User && $user->isAdmin();
    }
}
