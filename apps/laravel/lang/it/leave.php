<?php

return [
    'past' => 'Non si può chiedere un giorno già passato.',
    'range_too_long' => 'L\'intervallo non può superare :max giorni.',
    'no_working_days' => 'L\'intervallo non contiene giorni lavorativi.',
    'not_working_day' => 'Il giorno scelto non è lavorativo.',
    'single_day' => 'Questa richiesta riguarda un solo giorno.',
    'hours_step' => 'Gli orari vanno a multipli di 30 minuti.',
    'hours_too_long' => 'Le ore richieste superano la giornata di lavoro.',
    'hours_order' => 'L\'orario di fine deve essere dopo quello di inizio.',
    'hours_past' => 'L\'orario di inizio è già passato.',
    'overlap' => 'Hai già una richiesta in questi giorni.',
    'unit_not_allowed' => 'Questo tipo di assenza non si può chiedere in questa unità.',
    'type_not_requestable' => 'Questo tipo di assenza non è disponibile per te.',
    'state_changed' => 'La richiesta è cambiata nel frattempo: aggiorna la pagina.',
    'already_started' => 'L\'assenza è già iniziata.',

    'mail' => [
        'on_day' => 'il :date',
        'in_range' => 'dal :from al :to',
        'hours' => 'dalle :from alle :to',
        'half' => [
            'morning' => 'mattina',
            'afternoon' => 'pomeriggio',
        ],
        'reason' => 'Motivo: :reason',
        'note' => 'Nota della persona: :note',
        'submitted' => [
            'action' => 'Apri le richieste da approvare',
            'subject' => [
                'submitted' => 'Holidays: nuova richiesta di assenza',
                'cancellation_requested' => 'Holidays: annullamento richiesto',
                'auto_approved' => 'Holidays: assenza registrata',
            ],
            'body' => [
                'submitted' => ':person ha chiesto: :details. La richiesta è in attesa della tua decisione.',
                'cancellation_requested' => ':person ha chiesto di annullare: :details. L\'annullamento attende la tua decisione.',
                'auto_approved' => ':person ha registrato un\'assenza che non richiede approvazione: :details.',
            ],
        ],
        'decided' => [
            'action' => 'Vedi le tue richieste',
            'subject' => [
                'approved' => 'Holidays: richiesta approvata',
                'rejected' => 'Holidays: richiesta rifiutata',
                'cancellation_approved' => 'Holidays: annullamento approvato',
                'cancellation_rejected' => 'Holidays: annullamento rifiutato',
                'cancelled' => 'Holidays: richiesta annullata',
            ],
            'body' => [
                'approved' => ':actor ha approvato la tua richiesta: :details.',
                'rejected' => ':actor ha rifiutato la tua richiesta: :details.',
                'cancellation_approved' => ':actor ha approvato l\'annullamento: :details. Il saldo è stato restituito.',
                'cancellation_rejected' => ':actor ha rifiutato l\'annullamento: :details. La richiesta resta approvata.',
                'cancelled' => ':actor ha annullato la tua richiesta: :details. Il saldo è stato restituito.',
            ],
        ],
    ],
];
