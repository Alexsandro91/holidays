<?php

return [
    'not_found' => 'Utente non trovato.',
    'invitation_resent' => 'Invito inviato di nuovo.',
    'role_changed' => 'Ruolo aggiornato.',
    'not_active' => 'L’utente non è attivo.',
    'not_disabled' => 'L’utente non è disattivato.',
    'last_admin' => 'Serve almeno un amministratore attivo: questa azione lo lascerebbe senza.',
    'no_longer_admin' => 'Non sei più amministratore.',
    'not_promotable' => 'Si possono promuovere solo utenti attivi che non sono già amministratori.',
    'not_admin' => 'Questo utente non è un amministratore.',
    'state_changed' => 'La situazione dell’utente è cambiata nel frattempo. Ricarica la pagina e riprova.',
    'name_characters' => 'Il nome non può contenere parentesi quadre, i segni < > o caratteri di controllo.',
    'password_locked' => 'Troppi tentativi con la password. Riprova tra :minutes minuti.',
    'mail' => [
        'admin_change' => [
            'subject' => [
                'granted' => 'Holidays: nuovo amministratore',
                'revoked' => 'Holidays: ruolo di amministratore revocato',
                'disabled' => 'Holidays: amministratore disattivato',
                'enabled' => 'Holidays: amministratore riattivato',
            ],
            'body' => [
                'granted' => ':actor ha reso amministratore :target il :date.',
                'revoked' => ':actor ha revocato il ruolo di amministratore a :target il :date.',
                'disabled' => ':actor ha disattivato l’amministratore :target il :date.',
                'enabled' => ':actor ha riattivato l’amministratore :target il :date.',
            ],
            'unexpected' => 'Se non era previsto, avvisa subito il responsabile IT.',
        ],
    ],
];
