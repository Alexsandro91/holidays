<?php

return [
    'invitation_resent' => 'Invito inviato di nuovo.',
    'not_active' => 'L’utente non è attivo.',
    'not_disabled' => 'L’utente non è disattivato.',
    'last_admin' => 'Serve almeno un amministratore attivo: questa azione lo lascerebbe senza.',
    'no_longer_admin' => 'Non sei più amministratore.',
    'no_longer_allowed' => 'Non hai più i permessi per gestire gli utenti.',
    'not_promotable' => 'Si possono promuovere solo utenti attivi che non sono già amministratori.',
    'not_on_yourself' => 'Non puoi fare questa azione sul tuo account.',
    'not_admin' => 'Questo utente non è un amministratore.',
    'admin_not_active' => 'Si può revocare solo un amministratore attivo. Per un invito ancora da accettare usa Annulla invito.',
    'state_changed' => 'La situazione dell’utente è cambiata nel frattempo. Ricarica la pagina e riprova.',
    'email_locked' => 'L’email si può cambiare solo finché l’invito non è stato accettato: dopo l’attivazione è l’indirizzo con cui la persona accede.',
    'name_characters' => 'Il nome non può contenere parentesi quadre, i segni < > o caratteri di controllo.',
    'last_name_characters' => 'Il cognome non può contenere parentesi quadre, i segni < > o caratteri di controllo.',
    'password_locked' => 'Troppi tentativi con la password. Riprova tra :minutes minuti.',
    'mail' => [
        'admin_change' => [
            'subject' => [
                'granted' => 'Holidays: nuovo amministratore',
                'revoked' => 'Holidays: ruolo di amministratore revocato',
                'disabled' => 'Holidays: amministratore disattivato',
                'enabled' => 'Holidays: amministratore riattivato',
                'invited' => 'Holidays: nuovo amministratore invitato',
            ],
            'body' => [
                'granted' => ':actor ha reso amministratore :target il :date.',
                'revoked' => ':actor ha revocato il ruolo di amministratore a :target il :date.',
                'disabled' => ':actor ha disattivato l’amministratore :target il :date.',
                'enabled' => ':actor ha riattivato l’amministratore :target il :date.',
                'invited' => ':actor ha invitato :target come amministratore il :date. L’account sarà attivo quando :target accetterà l’invito.',
            ],
            'unexpected' => 'Se non era previsto, avvisa subito il responsabile IT.',
        ],
    ],
];
