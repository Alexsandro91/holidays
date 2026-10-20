<?php

return [
    'role' => [
        'employee' => 'Utente',
        'manager' => 'Responsabile',
        'admin' => 'HR / Admin',
    ],
    'employment_type' => [
        'employee' => 'Dipendente',
        'contractor' => 'Collaboratore esterno',
        'intern' => 'Stagista',
    ],
    'user_status' => [
        'invited' => 'Invitato',
        'active' => 'Attivo',
        'disabled' => 'Disattivato',
    ],
    'balance_type' => [
        'vacation' => 'Ferie',
        'rol' => 'ROL',
        'ex_holidays' => 'Ex festività',
    ],
    'balance_movement_kind' => [
        'accrual' => 'Maturazione',
        'adjustment' => 'Rettifica',
        'alignment' => 'Allineamento',
        'usage' => 'Utilizzo',
    ],
    'leave_request_status' => [
        'pending' => 'In attesa',
        'approved' => 'Approvata',
        'rejected' => 'Rifiutata',
        'withdrawn' => 'Ritirata',
        'cancellation_requested' => 'Annullamento richiesto',
        'cancelled' => 'Annullata',
    ],
    'leave_unit' => [
        'days' => 'Giorni',
        'half_day' => 'Mezza giornata',
        'hours' => 'Ore',
    ],
    'day_half' => [
        'morning' => 'Mattina',
        'afternoon' => 'Pomeriggio',
    ],
    'leave_source' => [
        'request' => 'Richiesta',
        'closure' => 'Chiusura aziendale',
    ],
];
