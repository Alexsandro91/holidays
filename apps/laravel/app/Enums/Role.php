<?php

namespace App\Enums;

use App\Support\Translate;

enum Role: string
{
    case Employee = 'employee';
    case Manager = 'manager';
    case Admin = 'admin';

    public function label(): string
    {
        return Translate::text('enums.role.'.$this->value);
    }
}
