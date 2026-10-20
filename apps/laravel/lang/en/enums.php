<?php

return [
    'role' => [
        'employee' => 'User',
        'manager' => 'Manager',
        'admin' => 'HR / Admin',
    ],
    'employment_type' => [
        'employee' => 'Employee',
        'contractor' => 'External contractor',
        'intern' => 'Intern',
    ],
    'user_status' => [
        'invited' => 'Invited',
        'active' => 'Active',
        'disabled' => 'Disabled',
    ],
    'balance_type' => [
        'vacation' => 'Vacation',
        'rol' => 'ROL',
        'ex_holidays' => 'Former public holidays',
    ],
    'balance_movement_kind' => [
        'accrual' => 'Accrual',
        'adjustment' => 'Adjustment',
        'alignment' => 'Alignment',
        'usage' => 'Usage',
    ],
    'leave_request_status' => [
        'pending' => 'Pending',
        'approved' => 'Approved',
        'rejected' => 'Rejected',
        'withdrawn' => 'Withdrawn',
        'cancellation_requested' => 'Cancellation requested',
        'cancelled' => 'Cancelled',
    ],
    'leave_unit' => [
        'days' => 'Days',
        'half_day' => 'Half day',
        'hours' => 'Hours',
    ],
    'day_half' => [
        'morning' => 'Morning',
        'afternoon' => 'Afternoon',
    ],
    'leave_source' => [
        'request' => 'Request',
        'closure' => 'Company closure',
    ],
];
