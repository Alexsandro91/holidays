<?php

return [
    'invitation_resent' => 'Invitation sent again.',
    'not_active' => 'This user is not active.',
    'not_disabled' => 'This user is not disabled.',
    'last_admin' => 'At least one active admin is required: this action would leave none.',
    'no_longer_admin' => 'You are no longer an admin.',
    'no_longer_allowed' => 'You are no longer allowed to manage users.',
    'not_promotable' => 'Only active users who are not admins yet can be promoted.',
    'not_on_yourself' => 'You cannot do this on your own account.',
    'not_admin' => 'This user is not an admin.',
    'admin_not_active' => 'Only an active admin can be revoked. For a pending invitation use Cancel invitation.',
    'state_changed' => 'This user changed in the meantime. Reload the page and try again.',
    'email_locked' => 'The email can be changed only until the invitation is accepted: after activation it is the address used to sign in.',
    'name_characters' => 'The first name cannot contain square brackets, < > signs or control characters.',
    'last_name_characters' => 'The last name cannot contain square brackets, < > signs or control characters.',
    'password_locked' => 'Too many password attempts. Try again in :minutes minutes.',
    'mail' => [
        'admin_change' => [
            'subject' => [
                'granted' => 'Holidays: admin rights granted',
                'revoked' => 'Holidays: admin rights revoked',
                'disabled' => 'Holidays: admin disabled',
                'enabled' => 'Holidays: admin enabled again',
                'invited' => 'Holidays: new admin invited',
                'email_changed' => 'Holidays: email of an invited admin changed',
            ],
            'body' => [
                'granted' => ':actor made :target an admin on :date.',
                'revoked' => ':actor revoked the admin rights of :target on :date.',
                'disabled' => ':actor disabled the admin :target on :date.',
                'enabled' => ':actor enabled the admin :target again on :date.',
                'invited' => ':actor invited :target as an admin on :date. The account will be active once :target accepts the invitation.',
                'email_changed' => ':actor changed the email of the invited admin :target on :date: the new invitation link went to the new address.',
            ],
            'unexpected' => 'If this was not expected, tell the IT manager right away.',
        ],
    ],
];
