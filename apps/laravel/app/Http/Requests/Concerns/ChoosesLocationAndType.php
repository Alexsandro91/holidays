<?php

namespace App\Http\Requests\Concerns;

use App\Enums\EmploymentType;
use App\Models\Location;
use App\Models\User;
use App\Support\Translate;
use Illuminate\Validation\Rule;

/**
 * Sede e tipo di rapporto nell'invito, nell'invito admin e nella modifica (spec §4.5, §7.4). La sede la sceglie solo
 * l'admin: dal responsabile il campo è vietato e la persona resta (o nasce) nella sua sede.
 */
trait ChoosesLocationAndType
{
    /**
     * @return array<string, list<mixed>>
     */
    protected function locationAndTypeRules(): array
    {
        return [
            'employment_type' => ['sometimes', Rule::enum(EmploymentType::class)],
            'location_id' => $this->actorIsAdmin()
                ? ['sometimes', 'nullable', 'integer', Rule::exists('locations', 'id')->whereNull('archived_at')]
                : ['prohibited'],
        ];
    }

    /**
     * @return array<string, string>
     */
    protected function locationMessages(): array
    {
        return ['location_id.exists' => Translate::text('locations.archived')];
    }

    public function chosenEmploymentType(): ?EmploymentType
    {
        return $this->enum('employment_type', EmploymentType::class);
    }

    public function chosenLocationId(): ?int
    {
        return $this->filled('location_id') ? $this->integer('location_id') : null;
    }

    /**
     * Sede di un invito: quella scelta dall'admin, altrimenti la principale; per il responsabile la sua.
     */
    public function invitationLocation(User $actor): Location
    {
        if (! $actor->isAdmin()) {
            return Location::query()->findOrFail($actor->location_id);
        }

        $locationId = $this->chosenLocationId();

        return $locationId === null ? Location::primary() : Location::query()->findOrFail($locationId);
    }

    private function actorIsAdmin(): bool
    {
        $user = $this->user();

        return $user instanceof User && $user->isAdmin();
    }
}
