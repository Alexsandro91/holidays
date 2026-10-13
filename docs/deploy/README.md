# Requisiti di deploy

Punti da configurare fuori dal codice prima di andare in produzione (dalle revisioni di sicurezza dell'autenticazione).
Gli header della SPA (CSP, HSTS) sono descritti nella spec, §8.4.

## Web server della SPA
- Header `Referrer-Policy: strict-origin` su tutte le pagine (la SPA ha anche il `<meta name="referrer">`, l'header vale
  anche per i client che lo ignorano): il link di reset porta token ed email nell'URL, quello dell'invito
  (`/invitation/<token>`) il token.
- Togliere dagli access log (o registrare il percorso senza token e query string), sia sul web server della SPA sia su
  quello delle API e sui proxy davanti:
  - `/reset-password/*`;
  - `/invitation/*` (pagina dell'invito);
  - `/api/invitations/*` (le chiamate della pagina dell'invito portano il token nel percorso).

## Proxy e load balancer
- Le richieste `DELETE` devono arrivare a Laravel con il corpo: la revoca di un amministratore
  (`DELETE /api/administrators/{id}`) manda nel corpo il nuovo ruolo e la password di conferma. Alcuni proxy e WAF
  scartano il corpo delle `DELETE`: la revoca risponderebbe sempre 422.

## Laravel (`.env` e configurazione)
- `APP_ENV=production`, `FRONTEND_URL` impostato all'origine https reale della SPA (finisce nei link delle email).
- `trustProxies` con i CIDR del load balancer, mai `*`: altrimenti l'IP dei limiti ai tentativi è falsificabile.
- `SESSION_DRIVER=database`: reset password e disattivazione chiudono le sessioni cancellando le righe di `sessions`.
- `CACHE_STORE` condiviso tra le istanze (database o redis): i limiti ai tentativi stanno in cache.
- `QUEUE_CONNECTION` diverso da `sync` e un worker della coda sempre attivo: le email partono dalla coda.
- `MAIL_MAILER` mai `log` in produzione: codici e link finirebbero nei file di log.
- `AUTH_PASSWORD_UNCOMPROMISED=true` (controllo delle password trafugate con HIBP); `LOG_HIBP_LEVEL=info`.

## PHP (`php.ini` di produzione)
- `zend.exception_ignore_args=On`: gli stack trace di log ed errori non riportano gli argomenti delle funzioni
  (password, token dell'invito). `#[\SensitiveParameter]` copre solo i parametri marcati.

## Comandi
- Nel deploy: `php artisan event:cache` (il listener del log HIBP è registrato dall'auto-discovery), oltre a
  `config:cache` e `route:cache`.
- Prima della produzione schedulare `auth:clear-resets` (token di reset scaduti) e `queue:prune-failed`.
- Primo avvio: dopo `php artisan migrate`, eseguire `php artisan app:create-admin "Nome Cognome" email@azienda.it`: arriva
  l'invito (72 ore) e l'admin sceglie la password dal link. L'invio è registrato in `auth_events` senza autore.
  - Invito non arrivato o scaduto: rilanciare lo stesso comando con la stessa email. Se l'admin non ha ancora attivato
    l'account parte un nuovo link e il precedente smette di valere.
  - Con un amministratore attivo il comando si rifiuta: gli altri admin si invitano e promuovono dalla sezione
    Amministratori. `--force` serve solo per recuperare l'accesso (per esempio l'unico admin ha perso la casella email).
- `PRIVACY_NOTICE_VERSION` va aggiornata ogni volta che cambia il testo dell'informativa privacy: la versione e la data
  della presa visione si salvano a ogni nuova attivazione di un account. La nuova presa visione da parte di chi è già
  attivo **non** è implementata: se il testo cambia in modo sostanziale gli utenti attivi vanno informati a parte.
