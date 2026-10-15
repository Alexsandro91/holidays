<?php

namespace App\Support;

use App\Enums\EmploymentType;

/**
 * Modifica di una persona (spec §4.5, §7.3): nome e cognome sempre, il resto solo se cambia (null = invariato).
 */
final readonly class UserChanges
{
    public function __construct(
        public string $firstName,
        public string $lastName,
        public ?string $email = null,
        public ?int $locationId = null,
        public ?EmploymentType $employmentType = null,
    ) {}
}
