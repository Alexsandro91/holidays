<?php

namespace App\Enums;

/**
 * Periodo a cui si riferisce il tetto di un tipo di assenza (spec §3.1): `Request` vale per la singola richiesta.
 */
enum AbsenceLimitPeriod: string
{
    case Month = 'month';
    case Year = 'year';
    case Request = 'request';
}
