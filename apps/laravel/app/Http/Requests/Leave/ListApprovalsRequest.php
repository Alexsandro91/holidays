<?php

namespace App\Http\Requests\Leave;

use App\Models\User;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Da approvare: filtro per sede, solo per l'admin (il responsabile vede già solo la sua).
 */
class ListApprovalsRequest extends FormRequest
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
        $user = $this->user();

        return [
            'filter' => ['sometimes', 'array'],
            'filter.location' => $user instanceof User && $user->isAdmin() ? ['sometimes', 'nullable', 'integer'] : ['prohibited'],
        ];
    }

    public function locationFilter(): ?int
    {
        return $this->filled('filter.location') ? $this->integer('filter.location') : null;
    }
}
