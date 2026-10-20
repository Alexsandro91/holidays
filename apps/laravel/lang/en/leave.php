<?php

return [
    'past' => 'You cannot request a day that has already passed.',
    'range_too_long' => 'The range cannot exceed :max days.',
    'no_working_days' => 'The range contains no working days.',
    'not_working_day' => 'The chosen day is not a working day.',
    'single_day' => 'This request covers a single day.',
    'hours_step' => 'Times must be in multiples of 30 minutes.',
    'hours_too_long' => 'The requested hours exceed the working day.',
    'hours_order' => 'The end time must be after the start time.',
    'hours_past' => 'The start time has already passed.',
    'overlap' => 'You already have a request on these days.',
    'unit_not_allowed' => 'This absence type cannot be requested in this unit.',
    'type_not_requestable' => 'This absence type is not available to you.',
    'state_changed' => 'The request has changed in the meantime: refresh the page.',
    'already_started' => 'The absence has already started.',

    'mail' => [
        'on_day' => 'on :date',
        'in_range' => 'from :from to :to',
        'hours' => 'from :from to :to',
        'half' => [
            'morning' => 'morning',
            'afternoon' => 'afternoon',
        ],
        'reason' => 'Reason: :reason',
        'note' => 'Note from the requester: :note',
        'submitted' => [
            'subject' => [
                'submitted' => 'Holidays: new leave request',
                'cancellation_requested' => 'Holidays: cancellation requested',
                'auto_approved' => 'Holidays: leave recorded',
            ],
            'body' => [
                'submitted' => ':person requested: :details. The request is waiting for your decision.',
                'cancellation_requested' => ':person asked to cancel: :details. The cancellation is waiting for your decision.',
                'auto_approved' => ':person recorded an absence that needs no approval: :details.',
            ],
        ],
        'decided' => [
            'subject' => [
                'approved' => 'Holidays: request approved',
                'rejected' => 'Holidays: request rejected',
                'cancellation_approved' => 'Holidays: cancellation approved',
                'cancellation_rejected' => 'Holidays: cancellation rejected',
                'cancelled' => 'Holidays: request cancelled',
            ],
            'body' => [
                'approved' => ':actor approved your request: :details.',
                'rejected' => ':actor rejected your request: :details.',
                'cancellation_approved' => ':actor approved the cancellation: :details. The balance has been given back.',
                'cancellation_rejected' => ':actor rejected the cancellation: :details. The request stays approved.',
                'cancelled' => ':actor cancelled your request: :details. The balance has been given back.',
            ],
        ],
    ],
];
