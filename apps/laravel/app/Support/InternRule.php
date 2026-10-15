<?php

namespace App\Support;

use App\Enums\EmploymentType;
use App\Enums\Role;
use Illuminate\Validation\ValidationException;

/**
 * Uno stagista ha solo il ruolo base "Utente" (spec §7.3). La controllano i servizi sulle righe rilette.
 */
final class InternRule
{
    /**
     * @param  string  $field  campo su cui segnalare l'errore (dipende dal flusso)
     */
    public static function ensureAllowed(EmploymentType $type, Role $role, string $field): void
    {
        if ($type === EmploymentType::Intern && $role !== Role::Employee) {
            throw ValidationException::withMessages([$field => [Translate::text('users.intern_role')]]);
        }
    }
}
