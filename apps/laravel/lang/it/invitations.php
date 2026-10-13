<?php

return [
    'resend_wait' => 'Attendi :seconds secondi prima di inviare di nuovo l’invito.',
    'not_invited' => 'Questo utente ha già attivato l’account: l’invito non c’è più.',
    'invalid' => 'Questo invito non è valido o è già stato usato.',
    'expired' => 'Questo invito è scaduto. Chiedi all’ufficio HR di inviartene uno nuovo.',
    'accepted' => 'Account attivato. Per entrare inserisci il codice che ti abbiamo inviato via email.',
    'mail' => [
        'subject' => 'Sei stato invitato su Holidays',
        'heading' => 'Benvenuto, :name',
        'intro_by' => ':inviter ti ha invitato su Holidays, l’app per ferie e permessi.',
        'intro' => 'Sei stato invitato su Holidays, l’app per ferie e permessi.',
        'action' => 'Attiva il tuo account',
        'expiry' => 'Il link vale :hours ore e si può usare una sola volta.',
        'fallback' => 'Se il pulsante non funziona, copia questo indirizzo nel browser: :url',
    ],
    'command' => [
        'sent' => 'Invito da amministratore inviato a :email. Vale :hours ore.',
    ],
];
