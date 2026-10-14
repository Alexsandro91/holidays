<?php

return [
    'link_sent' => 'If the address matches an active account, you’ll get an email with a link to choose a new password.',
    'invalid_link' => 'This link is invalid or has expired. Ask for a new one.',
    'done' => 'Password updated. To sign in, enter the code we emailed you.',
    'mail' => [
        'link' => [
            'subject' => 'Reset your Holidays password',
            'heading' => 'Reset your password',
            'intro' => 'We received a request to reset the password of your account.',
            'action' => 'Choose a new password',
            'expiry' => 'The link is valid for :minutes minutes and works only once.',
            'not_you' => 'If you didn’t ask for this link, ignore this email: your current password still works.',
            'requested_by_staff' => 'The link was requested by an administrator or your manager: if you weren’t expecting it, ignore this email and tell an administrator.',
            'fallback' => 'If the button doesn’t work, copy this address into your browser: :url',
        ],
        'changed' => [
            'subject' => 'Your Holidays password was changed',
            'heading' => 'Password changed',
            'intro' => 'The password of your account was changed from :device on :date. For your security we signed out every other open session.',
            'not_you' => 'If this wasn’t you, use Forgot password on the sign-in page and tell an administrator.',
        ],
    ],
];
