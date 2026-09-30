<?php

namespace App\Enums;

enum AuthEventType: string
{
    case LoginSucceeded = 'login_succeeded';
    case LoginFailed = 'login_failed';
    case CodeFailed = 'code_failed';
    case LockedOut = 'locked_out';
    case InvitationSent = 'invitation_sent';
    case InvitationAccepted = 'invitation_accepted';
    case PasswordReset = 'password_reset';
    case PasswordChanged = 'password_changed';
    case UserDisabled = 'user_disabled';
    case UserEnabled = 'user_enabled';
    case LoggedOut = 'logged_out';
}
