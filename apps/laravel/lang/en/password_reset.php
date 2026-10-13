<?php

return [
    'link_sent' => 'If the address matches an active account, you’ll get an email with a link to choose a new password.',
    'mail' => [
        'link' => [
            'subject' => 'Reset your Holidays password',
            'heading' => 'Reset your password',
            'intro' => 'We received a request to reset the password of your account.',
            'action' => 'Choose a new password',
            'expiry' => 'The link is valid for :minutes minutes and works only once.',
            'not_you' => 'If you didn’t ask for this link, ignore this email: your current password still works.',
            'fallback' => 'If the button doesn’t work, copy this address into your browser: :url',
        ],
    ],
];
