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
    ],
];
