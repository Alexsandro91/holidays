<?php

return [
    'link_sent' => 'Se l’indirizzo corrisponde a un account attivo, riceverai un’email con il link per scegliere una nuova password.',
    'mail' => [
        'link' => [
            'subject' => 'Reimposta la password di Holidays',
            'heading' => 'Reimposta la password',
            'intro' => 'Abbiamo ricevuto una richiesta per reimpostare la password del tuo account.',
            'action' => 'Scegli una nuova password',
            'expiry' => 'Il link vale :minutes minuti e si può usare una sola volta.',
            'not_you' => 'Se non hai chiesto tu il link, ignora questa email: la password attuale resta valida.',
            'fallback' => 'Se il pulsante non funziona, copia questo indirizzo nel browser: :url',
        ],
    ],
];
