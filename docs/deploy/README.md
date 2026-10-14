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

- Header `Content-Security-Policy` su tutte le pagine della SPA (una riga sola):

  ```
  Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-n/psEl/11gdD2U8t7eb56eCJRGOMplCZzuupMahdT2w='; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  ```

  - L'hash autorizza l'unico script inline, quello del tema in `apps/react/index.html` (applica il tema scuro prima del
    primo paint). È lo SHA-256 in base64 del contenuto esatto tra `<script>` e `</script>`, identico in
    `dist/index.html` dopo `npm run build`. Se lo script cambia (anche solo un commento o uno spazio) l'hash va
    ricalcolato: il test `src/lib/csp.test.ts` fallisce finché questo README non è aggiornato.
  - `style-src 'unsafe-inline'` serve: Sonner (toast), il blocco dello scroll dei dialog Radix e next-themes
    inseriscono elementi `<style>` a runtime. Gli stili impostati da JavaScript (`element.style`) non dipendono dalla CSP.
  - Font e bundle sono serviti dalla stessa origine (`default-src 'self'`); le API stanno sulla stessa origine della SPA
    (`connect-src 'self'`). Se le API vengono servite da un'altra origine, aggiungerla a `connect-src`.
  - Niente `'unsafe-eval'`: Zod 4 proverebbe a compilare gli schemi con `new Function()`, ma l'app lo configura in
    modalità `jitless` (`src/lib/zodConfig.ts`), quindi la console non deve mostrare violazioni `unsafe-eval`.
  - `object-src 'none'`: nessun plugin o `<object>`; è coperto anche da `default-src`, ma è quello che si aspettano gli
    strumenti di valutazione delle CSP.
  - Prima di attivarla si può provare con `Content-Security-Policy-Report-Only` e controllare la console del browser:
    non devono comparire violazioni.

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
- `AUTH_EVENTS_RETENTION_DAYS` (giorni di conservazione del log di sicurezza, default 180): un valore vuoto o ≤ 0
  sospende la pulizia del log invece di cancellarlo.

## PHP (`php.ini` di produzione)
- `zend.exception_ignore_args=On`: gli stack trace di log ed errori non riportano gli argomenti delle funzioni
  (password, token dell'invito). `#[\SensitiveParameter]` copre solo i parametri marcati.

## Comandi
- Nel deploy: `php artisan event:cache` (il listener del log HIBP è registrato dall'auto-discovery), oltre a
  `config:cache` e `route:cache`.
- Scheduler sempre attivo: cron ogni minuto con `php artisan schedule:run` (oppure `php artisan schedule:work` come
  servizio). Senza scheduler non gira nessuna pulizia. Ogni giorno: `model:prune` (challenge di login scadute, inviti
  non accettati scaduti da oltre 30 giorni, eventi di sicurezza oltre `AUTH_EVENTS_RETENTION_DAYS`, default 180),
  `auth:clear-resets` (token di reset scaduti) e `queue:prune-failed --hours=720`. I comandi usano `onOneServer`:
  serve uno store cache con lock condiviso tra le istanze (database o redis).
- Primo avvio: dopo `php artisan migrate`, eseguire `php artisan app:create-admin "Nome Cognome" email@azienda.it`: arriva
  l'invito (72 ore) e l'admin sceglie la password dal link. L'invio è registrato in `auth_events` senza autore.
  - Invito non arrivato o scaduto: rilanciare lo stesso comando con la stessa email. Se l'admin non ha ancora attivato
    l'account parte un nuovo link e il precedente smette di valere.
  - Con un amministratore attivo il comando si rifiuta: gli altri admin si invitano e promuovono dalla sezione
    Amministratori. `--force` serve solo per recuperare l'accesso (per esempio l'unico admin ha perso la casella email).
- `PRIVACY_NOTICE_VERSION` va aggiornata ogni volta che cambia il testo dell'informativa privacy: la versione e la data
  della presa visione si salvano a ogni nuova attivazione di un account. La nuova presa visione da parte di chi è già
  attivo **non** è implementata: se il testo cambia in modo sostanziale gli utenti attivi vanno informati a parte.
