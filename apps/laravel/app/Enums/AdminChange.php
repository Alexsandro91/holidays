<?php

namespace App\Enums;

enum AdminChange: string
{
    case Granted = 'granted';
    case Revoked = 'revoked';
    case Disabled = 'disabled';
    case Enabled = 'enabled';
    case Invited = 'invited';
    case EmailChanged = 'email_changed';
    case PasswordResetSent = 'password_reset_sent';
    case LocationChanged = 'location_changed';
    case EmploymentTypeChanged = 'employment_type_changed';
}
