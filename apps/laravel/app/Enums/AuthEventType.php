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
    case InvitationCancelled = 'invitation_cancelled';
    case RoleChanged = 'role_changed';
    case AdminGranted = 'admin_granted';
    case AdminRevoked = 'admin_revoked';
    case AdminInvited = 'admin_invited';
    case AdminPasswordFailed = 'admin_password_failed';
    case AdminPasswordLocked = 'admin_password_locked';
}
