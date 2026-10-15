<?php

namespace App\Enums;

use App\Support\Translate;

/**
 * Tipo di rapporto con l'azienda (spec §7): non decide cosa la persona può fare nell'app (quello è il ruolo), ma
 * quali assenze e saldi valgono (fase 2). Uno stagista ha solo il ruolo base.
 */
enum EmploymentType: string
{
    case Employee = 'employee';
    case Contractor = 'contractor';
    case Intern = 'intern';

    public function label(): string
    {
        return Translate::text('enums.employment_type.'.$this->value);
    }
}
