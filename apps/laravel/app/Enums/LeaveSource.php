<?php

namespace App\Enums;

use App\Support\Translate;

/**
 * Origine di una richiesta: la persona (`request`) o una chiusura aziendale (`closure`, dalla tappa 2).
 */
enum LeaveSource: string
{
    case Request = 'request';
    case Closure = 'closure';

    public function label(): string
    {
        return Translate::text('enums.leave_source.'.$this->value);
    }
}
