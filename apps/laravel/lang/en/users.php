<?php

return [
    'not_found' => 'User not found.',
    'invitation_resent' => 'Invitation sent again.',
    'role_changed' => 'Role updated.',
    'not_active' => 'This user is not active.',
    'not_disabled' => 'This user is not disabled.',
    'last_admin' => 'At least one active admin is required: this action would leave none.',
    'no_longer_admin' => 'You are no longer an admin.',
    'password_locked' => 'Too many password attempts. Try again in :minutes minutes.',
    'mail' => [
        'admin_change' => [
            'subject' => [
                'granted' => 'Holidays: admin rights granted',
                'revoked' => 'Holidays: admin rights revoked',
                'disabled' => 'Holidays: admin disabled',
                'enabled' => 'Holidays: admin enabled again',
            ],
            'body' => [
                'granted' => ':actor made :target an admin on :date.',
                'revoked' => ':actor revoked the admin rights of :target on :date.',
                'disabled' => ':actor disabled the admin :target on :date.',
                'enabled' => ':actor enabled the admin :target again on :date.',
            ],
            'unexpected' => 'If this was not expected, tell the IT manager right away.',
        ],
    ],
];
