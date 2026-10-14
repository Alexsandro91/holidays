<?php

namespace App\Enums;

enum AdminChange: string
{
    case Granted = 'granted';
    case Revoked = 'revoked';
    case Disabled = 'disabled';
    case Enabled = 'enabled';
    case Invited = 'invited';
}
