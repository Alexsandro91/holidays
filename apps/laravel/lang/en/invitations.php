<?php

return [
    'resend_wait' => 'Wait :seconds seconds before sending the invitation again.',
    'not_invited' => 'This user has already activated the account: there is no invitation any more.',
    'invalid' => 'This invitation is invalid or has already been used.',
    'expired' => 'This invitation has expired. Ask HR to send you a new one.',
    'accepted' => 'Account activated. To sign in, enter the code we emailed you.',
    'mail' => [
        'subject' => 'You’re invited to Holidays',
        'heading' => 'Welcome, :name',
        'intro_by' => ':inviter invited you to Holidays, the leave and time-off app.',
        'intro' => 'You were invited to Holidays, the leave and time-off app.',
        'action' => 'Activate your account',
        'expiry' => 'The link is valid for :hours hours and works only once.',
        'fallback' => 'If the button doesn’t work, copy this address into your browser: :url',
    ],
    'command' => [
        'sent' => 'Admin invitation sent to :email. It is valid for :hours hours.',
        'resent' => 'The admin :email has not activated the account yet: a new invitation was sent and the previous link no longer works. It is valid for :hours hours.',
        'admin_exists' => 'An active admin already exists: use the Administrators section, or --force.',
    ],
];
