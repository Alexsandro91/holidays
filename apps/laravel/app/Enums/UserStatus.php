<?php

namespace App\Enums;

use App\Support\Translate;

enum UserStatus: string
{
    case Invited = 'invited';
    case Active = 'active';
    case Disabled = 'disabled';

    public function label(): string
    {
        return Translate::text('enums.user_status.'.$this->value);
    }
}
