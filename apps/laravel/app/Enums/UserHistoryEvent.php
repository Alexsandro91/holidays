<?php

namespace App\Enums;

/**
 * Tappe dello storico di una persona (spec §8.1). Nome, email, password e lingua non sono tappe del rapporto.
 */
enum UserHistoryEvent: string
{
    case Imported = 'imported';
    case Invited = 'invited';
    case Activated = 'activated';
    case RoleChanged = 'role_changed';
    case EmploymentTypeChanged = 'employment_type_changed';
    case LocationChanged = 'location_changed';
    case Disabled = 'disabled';
    case Enabled = 'enabled';
}
