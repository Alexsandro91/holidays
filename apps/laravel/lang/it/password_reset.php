<?php

return [
    'link_sent' => 'Se l’indirizzo corrisponde a un account attivo, riceverai un’email con il link per scegliere una nuova password.',
    'invalid_link' => 'Il link non è valido o è scaduto. Chiedine uno nuovo.',
    'done' => 'Password aggiornata. Per entrare inserisci il codice che ti abbiamo inviato via email.',
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
        'changed' => [
            'subject' => 'La password di Holidays è stata cambiata',
            'heading' => 'Password cambiata',
            'intro' => 'La password del tuo account è stata cambiata da :device il :date. Per sicurezza abbiamo chiuso le altre sessioni aperte.',
            'not_you' => 'Se non sei stato tu, usa Password dimenticata nella pagina di accesso e avvisa un amministratore.',
        ],
    ],
];
