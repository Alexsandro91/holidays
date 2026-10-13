# Requisiti di deploy

Punti da configurare fuori dal codice prima di andare in produzione (dalle revisioni di sicurezza dell'autenticazione).
Gli header della SPA (CSP, HSTS) sono descritti nella spec, §8.4.

## Web server della SPA
- Header `Referrer-Policy: strict-origin` su tutte le pagine (la SPA ha anche il `<meta name="referrer">`, l'header vale
  anche per i client che lo ignorano): il link di reset porta token ed email nell'URL.
- Togliere `/reset-password/*` dagli access log (o registrare il percorso senza token e query string).

## Laravel (`.env` e configurazione)
- `APP_ENV=production`, `FRONTEND_URL` impostato all'origine https reale della SPA (finisce nei link delle email).
- `trustProxies` con i CIDR del load balancer, mai `*`: altrimenti l'IP dei limiti ai tentativi è falsificabile.
- `SESSION_DRIVER=database`: reset password e disattivazione chiudono le sessioni cancellando le righe di `sessions`.
- `CACHE_STORE` condiviso tra le istanze (database o redis): i limiti ai tentativi stanno in cache.
- `QUEUE_CONNECTION` diverso da `sync` e un worker della coda sempre attivo: le email partono dalla coda.
- `MAIL_MAILER` mai `log` in produzione: codici e link finirebbero nei file di log.
- `AUTH_PASSWORD_UNCOMPROMISED=true` (controllo delle password trafugate con HIBP); `LOG_HIBP_LEVEL=info`.

## Comandi
- Nel deploy: `php artisan event:cache` (il listener del log HIBP è registrato dall'auto-discovery), oltre a
  `config:cache` e `route:cache`.
- Prima della produzione schedulare `auth:clear-resets` (token di reset scaduti) e `queue:prune-failed`.
