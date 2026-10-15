<?php

namespace App\Enums;

use App\Support\Translate;

enum Role: string
{
    /**
     * Ruolo base, mostrato come "Utente" (spec §7.2): da non confondere con `EmploymentType::Employee`, il tipo di
     * rapporto "Dipendente". Il valore resta `employee` per non cambiare API, link ed E2E.
     */
    case Employee = 'employee';
    case Manager = 'manager';
    case Admin = 'admin';

    public function label(): string
    {
        return Translate::text('enums.role.'.$this->value);
    }
}
