# Sotto-progetto 1 — Fondamenta e autenticazione

- **Data:** 30 settembre 2026
- **Stato:** in revisione
- **Prototipo UI approvato:** https://claude.ai/artifact/NLkAk9hyf1KihatEs1A9Vj (dati finti, solo aspetto e flussi)

## 1. Contesto e obiettivo

Holidays è il gestionale delle **ferie e dei permessi dei dipendenti** di **una sola azienda**. Le **sedi sono
facoltative**: l'app funziona anche senza sedi e se ne possono configurare una o più quando servono (arrivano
con il sotto-progetto sulle ferie; nessun campo sede è obbligatorio).

Questo sotto-progetto costruisce le fondamenta su cui poggia tutto il resto: comunicazione React ↔ Laravel,
autenticazione completa e sicura, gestione minima degli inviti, base UI con multilingua e tema chiaro/scuro.

### Roadmap dei sotto-progetti (ognuno con spec, piano e implementazione propri)

1. **Fondamenta e autenticazione** — questo documento.
2. **Secondo fattore forte**: app di autenticazione (TOTP) e passkey, almeno per HR/admin. **Obbligatorio prima della produzione.**
3. **Gestione ferie e permessi** (dominio), incluse sedi facoltative.
4. **LLM in piattaforma**, con gli obblighi di trasparenza dell'AI Act. L'AI non decide né suggerisce
   approvazioni e non valuta i dipendenti (sarebbe rischio alto, Allegato III).
5. **Server MCP per Claude** (strumenti, OAuth, MCP Apps per la UI dentro Claude).
6. **Diritti GDPR**: export e cancellazione dell'account, registro dei trattamenti, responsabili esterni (mail, LLM).

## 2. Perimetro

**Incluso**
- Collegamento SPA ↔ API con Sanctum (cookie di sessione) e Fortify headless.
- Login con password + **codice di 6 cifre via email a ogni accesso**.
- Recupero password, cambio password dal profilo, logout.
- Account solo su **invito HR** (niente registrazione pubblica); primo admin via comando artisan.
- Gestione minima utenti per l'admin: invita, reinvia, annulla invito, disattiva, riattiva.
- Ruoli `employee`, `manager`, `admin` e Policy native Laravel.
- Multilingua **it** (predefinito) / **en**, frontend e backend (errori, email).
- Tema **chiaro / scuro / sistema**.
- Log di sicurezza con conservazione limitata, pagina informativa privacy (testo segnaposto).
- Servizi `queue` e `scheduler` in Sail.

**Escluso** (sotto-progetti successivi o fuori ambito)
- TOTP e passkey (sotto-progetto 2), SSO Microsoft/Google (predisposto, non implementato).
- Sedi, ferie, calendari, approvazioni (sotto-progetto 3).
- AI, MCP, export/cancellazione GDPR (sotto-progetti 4–6).
- Deploy di produzione: si documenta la configurazione del web server, non si esegue il deploy.

## 3. Criteri di successo

- HR invita un dipendente → il dipendente imposta la password → accede con il codice via email.
- Il recupero password funziona e non salta mai il codice.
- Nessun flusso rivela se un'email è registrata (risposte e tempi uguali).
- I tentativi ripetuti vengono bloccati con `429` e conto alla rovescia in UI.
- Ogni flusso è usabile solo da tastiera e con lettore di schermo; axe senza violazioni in chiaro e in scuro.
- Ogni flusso ha test feature (backend), unit/componenti (frontend) ed E2E; Pint, Larastan, ESLint e `tsc` puliti.

## 4. Decisioni prese

| Tema | Decisione |
|---|---|
| Autenticazione | Sanctum SPA (sessione in cookie `httpOnly`) + Fortify headless. Token nel browser scartati (XSS) |
| Secondo fattore | Codice 6 cifre via email a **ogni** login, senza "ricorda dispositivo". TOTP/passkey nel sotto-progetto 2 |
| Account | Solo su invito HR; struttura pronta per SSO futuro (`password` nullable) |
| Ruoli | `employee`, `manager`, `admin` (nomi inglesi nel codice e nel DB, etichette tradotte in UI) |
| Azienda | Una sola; sedi facoltative, nessun multi-tenant |
| Topologia | SPA e API sullo **stesso dominio**: proxy Vite in sviluppo, reverse proxy in produzione. CORS chiuso |
| Lingue | `it` predefinita, `en` selezionabile; preferenza salvata nel profilo |
| Tema | Chiaro / scuro / sistema, salvato nel browser (`localStorage`) |
| UI | shadcn (Radix) + Tailwind v4, React Router, TanStack Query, react-hook-form + zod |
| Stile | Accento **Laguna** (blu-verde), font **Inter** installato nel progetto, angoli **medi** |
| Password | Min 12 caratteri, nessun obbligo di simboli, `Password::uncompromised()`, hash Argon2id |
| Log | `auth_events` solo per sicurezza, 180 giorni, visibile solo all'admin (art. 4 Statuto dei Lavoratori) |
| Qualità | PHPUnit, Vitest, Playwright, Pint, **Larastan**, ESLint, `tsc`, `composer audit`, `npm audit` |
| API | Nessun versioning per l'API interna della SPA; si introduce `/api/v1` quando arriveranno client esterni (MCP) |

## 5. Architettura

```
Browser ──► localhost:5174 (Vite, React)
              ├─ /                → SPA
              └─ /api, /sanctum ──proxy──► localhost:80 (Laravel su Sail)
```

- **Sviluppo:** il proxy di Vite inoltra `/api` e `/sanctum` a `API_PROXY_TARGET`. Il browser vede un'unica origine:
  niente CORS, cookie di prima parte.
- **Produzione:** stesso principio (es. `ferie.azienda.it`, `/api` inoltrato a Laravel dal web server).
- **Sanctum:** `statefulApi()` in `bootstrap/app.php`; `SANCTUM_STATEFUL_DOMAINS` con host esatti
  (`localhost:5173,localhost:5174` in dev). Sessioni su `database`.
- **Fortify:** `views => false`, prefisso `api/auth`. Feature attive: solo `resetPasswords`. Registrazione e 2FA
  TOTP di Fortify disattivati; il codice via email è un passo custom della pipeline `Fortify::authenticateThrough`.
- **Link nelle email:** puntano alla SPA tramite `FRONTEND_URL` (`ResetPassword::createUrlUsing`, link invito).
- **Frontend:** client HTTP `src/lib/api.ts` su `fetch` (nessuna dipendenza): header `X-XSRF-TOKEN` dal cookie,
  `Accept-Language`, `credentials: 'include'`, errori normalizzati in un tipo unico (`401`, `403`, `419`, `422`
  con errori per campo, `429` con `retry_after`). Letture e scritture con TanStack Query.
- **i18n:** frontend `react-i18next` (`it.json`, `en.json`); backend middleware `SetLocale` con priorità
  profilo utente → `Accept-Language` → `it`, whitelist `it|en`. Traduzioni framework da `laravel-lang/common`.
- **Tema:** variabili CSS shadcn, classe `dark` su `<html>`; script inline in `index.html` applica il tema prima
  del primo paint (autorizzato in CSP tramite hash).
- **Sail:** nuovi servizi `queue` (`queue:work`) e `scheduler` (`schedule:work`) con la stessa immagine dell'app.

## 6. Flussi

### 6.1 Invito
1. Admin inserisce nome, email, ruolo → utente `invited` senza password + `invitations` con token casuale
   (64 caratteri, salvato come SHA-256), validità **72 ore**, uso singolo → email di invito (in coda).
2. Il link apre `/invitation/:token` → la SPA legge nome ed email dall'API.
3. L'utente sceglie la password e **prende visione** dell'informativa (non è un consenso: base giuridica art. 6.1.b).
   Si salvano `privacy_notice_version` e `privacy_notice_acknowledged_at`; `email_verified_at` = ora.
4. Stato `active`, invito marcato come accettato → pagina di conferma → login con email precompilata.
5. Admin può **reinviare** (nuovo token, il vecchio smette di valere), **annullare** (solo se mai attivato: cancella
   utente e invito), **disattivare/riattivare** (disattivare cancella subito tutte le sessioni dell'utente).
6. Primo admin: `sail artisan app:create-admin` (nome, email) → invito come tutti gli altri, nessuna password in terminale.

### 6.2 Login con codice via email
1. `GET /sanctum/csrf-cookie`, poi `POST /api/auth/login` con email e password.
2. Credenziali verificate **senza aprire la sessione**. Se l'utente non esiste si esegue comunque un `Hash::check`
   su un hash fittizio (tempi uguali).
3. Se valide e utente `active`: nuovo `login_challenges` (codice `random_int`, salvato come HMAC-SHA256 con la
   chiave dell'app, validità **10 minuti**), ID della challenge in sessione, rigenerazione della sessione, email
   con il codice (in coda). Risposta `200 { two_factor: true }`.
4. Se non valide, utente inesistente, `invited` o `disabled`: sempre `422` con lo stesso messaggio generico.
5. `POST /api/auth/two-factor` con il codice: confronto `hash_equals`. Corretto → `Auth::login`, rigenerazione
   sessione, challenge cancellata, `last_login_at` aggiornato, evento registrato, risposta con `UserResource`.
6. Sbagliato → `attempts + 1`; al **5°** errore o a scadenza la challenge viene invalidata e la risposta chiede di
   ricominciare il login (`422` con `meta.restart = true`).
7. `POST /api/auth/two-factor/resend`: dopo almeno **60 secondi** dall'ultimo invio, massimo **3** per challenge;
   il nuovo codice annulla il precedente e azzera i tentativi.

### 6.3 Recupero password
1. `POST /api/auth/forgot-password`: risposta **sempre** `202` con lo stesso messaggio (si sovrascrive la risposta
   di Fortify che segnalerebbe email inesistenti). Email solo per utenti `active`.
2. Link a `/reset-password/:token?email=…`, validità **60 minuti**, uso singolo (broker Laravel).
3. `POST /api/auth/reset-password`: nuova password → cancellate tutte le sessioni dell'utente, email
   "password cambiata", redirect al login. Il login successivo richiede comunque il codice.

### 6.4 Sessione, profilo, logout
- Scadenza per inattività **2 ore** (`SESSION_LIFETIME=120`) e assoluta **12 ore** dal login
  (middleware `EnforceAbsoluteSessionLifetime`, timestamp di login in sessione). Nessun "Ricordami".
- La SPA avvisa **2 minuti prima** della scadenza per inattività con "Resta collegato" (WCAG 2.2.1).
- Sessione scaduta → messaggio dedicato e ritorno alla pagina di partenza dopo il login (solo percorsi interni).
- Profilo: cambio password (richiede quella attuale, chiude le altre sessioni, email di conferma), lingua, tema.
- Logout: invalida la sessione e rigenera il token CSRF.

### 6.5 Contratto API

| Metodo e percorso | Esito |
|---|---|
| `GET /sanctum/csrf-cookie` | `204`, imposta `XSRF-TOKEN` |
| `POST /api/auth/login` | `200 {two_factor:true}` · `422` generico · `429` |
| `POST /api/auth/two-factor` | `200 UserResource` · `422` (`errors.code`, `meta.attempts_left` o `meta.restart`) · `429` |
| `POST /api/auth/two-factor/resend` | `202` · `429 {retry_after}` · `422 meta.restart` |
| `POST /api/auth/logout` | `204` |
| `POST /api/auth/forgot-password` | `202` sempre |
| `POST /api/auth/reset-password` | `200` · `422` |
| `GET /api/auth/user` | `200 UserResource` · `401` |
| `GET /api/invitations/{token}` | `200 {name, email}` · `404` non valido · `410` scaduto |
| `POST /api/invitations/{token}/accept` | `200` · `422` · `410` |
| `PUT /api/profile/password` | `204` · `422` |
| `PATCH /api/profile/preferences` | `200 UserResource` (`locale`) |
| `GET /api/users?filter[status]=&search=` | `200` paginato (solo admin) |
| `POST /api/users` | `201` invito creato (solo admin) |
| `POST /api/users/{user}/invitation` | `202` reinvio (solo admin) |
| `DELETE /api/users/{user}/invitation` | `204` annulla invito (solo admin, solo utenti `invited`) |
| `POST /api/users/{user}/disable` · `/enable` | `200 UserResource` (solo admin, non su sé stessi) |

Formato errori unico: `{ "message": string, "errors"?: { campo: string[] }, "meta"?: object }`.

## 7. Dati

### 7.1 Tabelle

**`users`** (migration iniziale modificata, siamo pre-produzione)

| Colonna | Tipo | Note |
|---|---|---|
| `id` | bigint | |
| `name` | string | |
| `email` | string, unique | |
| `password` | string, nullable | nullable per invitati e SSO futuro |
| `role` | string(20) | `employee` · `manager` · `admin` |
| `status` | string(20), index | `invited` · `active` · `disabled` |
| `locale` | string(5) | default `it` |
| `email_verified_at` | timestamp, nullable | impostato all'accettazione dell'invito |
| `privacy_notice_version` | string(20), nullable | |
| `privacy_notice_acknowledged_at` | timestamp, nullable | |
| `last_login_at` | timestamp, nullable | |
| `timestamps` | | `remember_token` rimosso |

**`invitations`**: `id`, `user_id` (FK cascade), `token_hash` (char 64, unique), `invited_by` (FK users, null on
delete), `expires_at`, `accepted_at` nullable, `timestamps`. Un solo invito attivo per utente.

**`login_challenges`**: `id`, `user_id` (FK cascade), `code_hash` (char 64), `expires_at`, `attempts` (tinyint),
`resend_count` (tinyint), `last_sent_at`, `timestamps`.

**`auth_events`**: `id`, `user_id` nullable (FK null on delete), `event` string(40), `ip_address` string(45),
`user_agent` string(255) troncato, `created_at` (index). Nessuna email per tentativi su utenti inesistenti.

Tabelle standard: `password_reset_tokens`, `sessions`, `jobs`, `failed_jobs`, `cache`. `personal_access_tokens`
resta inutilizzata finché il sotto-progetto MCP non decide il meccanismo di autenticazione dei client esterni.

### 7.2 Enum (`app/Enums/`)
- `Role`: `Employee = 'employee'`, `Manager = 'manager'`, `Admin = 'admin'`, con `label()` tradotta.
- `UserStatus`: `Invited`, `Active`, `Disabled`.
- `AuthEventType`: `LoginSucceeded`, `LoginFailed`, `CodeFailed`, `LockedOut`, `InvitationSent`,
  `InvitationAccepted`, `PasswordReset`, `PasswordChanged`, `UserDisabled`, `UserEnabled`, `LoggedOut`.
- Nelle migration i valori sono stringhe letterali (nessuna classe Enum).

### 7.3 Conservazione (GDPR) e pulizia automatica

| Dato | Conservazione | Meccanismo |
|---|---|---|
| Sessioni | fino a scadenza | garbage collection sessioni |
| `login_challenges` | cancellate all'uso, scadute rimosse ogni giorno | `Prunable` + `model:prune` |
| `password_reset_tokens` | 60 minuti | `auth:clear-resets` giornaliero |
| `invitations` scadute o annullate | 30 giorni | `Prunable` |
| `auth_events` | 180 giorni (`AUTH_EVENTS_RETENTION_DAYS`) | `MassPrunable` |
| `failed_jobs` | 30 giorni | `queue:prune-failed --hours=720` |

**Limite di finalità:** `auth_events` serve solo alla sicurezza (art. 32 GDPR). Nessuna schermata o report di
presenza/attività, accesso riservato all'admin. Questo limite vale anche per i sotto-progetti futuri.

## 8. Sicurezza

### 8.1 Limiti ai tentativi (`RateLimiter`)

| Azione | Limite |
|---|---|
| Login | 5/min per email + IP, 20/min per IP |
| Codice | 5 tentativi per challenge, 10/min per IP |
| Nuovo codice | 60 s di attesa, max 3 per challenge |
| Recupero password | 3 ogni 15 min per email + IP |
| Reset password, accettazione invito | 10/min per IP |
| API autenticata | 60/min per utente |

### 8.2 Credenziali e sessioni
- Password: Argon2id (verifica supporto nel container; ripiego bcrypt costo 12). Regole: `min:12`, `uncompromised()`.
- Codici: `random_int`, HMAC-SHA256, `hash_equals`. Token invito: 64 caratteri casuali, SHA-256.
- Mai in log: password, codici, token, cookie. Log strutturati con contesto.
- Sessione rigenerata dopo le credenziali e dopo il codice. Middleware `EnsureUserIsActive` su ogni rotta protetta.
- Disattivazione, reset e cambio password cancellano le sessioni dell'utente (le altre, per il cambio dal profilo).
- Cookie in produzione: `Secure`, `HttpOnly`, `SameSite=Lax`, `SESSION_DOMAIN` vuoto, nome `__Host-holidays_session`.

### 8.3 Autorizzazione e input
- `UserPolicy` nativa: gestione utenti solo `admin`; nessuna azione admin su sé stessi (disattivazione).
- FormRequest per ogni input, `UserResource` per ogni output (solo `id`, `name`, `email`, `role`, `status`,
  `locale`, `last_login_at`; mai password o dati tecnici).

### 8.4 Header
- **API** (middleware `SecurityHeaders`): `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` restrittiva, `Cache-Control:
  no-store` sulle risposte di autenticazione, `Strict-Transport-Security` solo in produzione.
- **SPA in produzione** (configurazione del web server, documentata in `docs/deploy/`): CSP con
  `default-src 'self'; script-src 'self' 'sha256-…'` (script del tema), `frame-ancestors 'none'`, più HSTS.

### 8.5 Frontend
- Nessun token nel browser; `localStorage` solo per tema.
- `dangerouslySetInnerHTML` vietato via ESLint (`no-restricted-syntax`).
- Redirect post-login solo verso percorsi interni (`/…`, niente `//` né URL assoluti).

### 8.6 Rischi residui
- **Codice via email:** non conforme a NIST SP 800-63B come secondo fattore e non resistente al phishing.
  Accettato per questo sotto-progetto; il sotto-progetto 2 (TOTP/passkey) è **bloccante per la produzione**.
- **XSS:** mitigato da React, CSP, lint; resta possibile agire nella sessione aperta.
- **Errori di implementazione:** mitigati da test su ogni caso negativo e audit prima del rilascio.

## 9. Interfaccia

### 9.1 Pagine (percorsi in inglese, uguali nelle due lingue)
- **Pubbliche** (layout diviso: pannello con calendario del team a sinistra su desktop, form a destra; lingua e
  tema in alto): `/login`, `/login/verify`, `/forgot-password`, `/reset-password/:token`, `/invitation/:token`,
  `/privacy`.
- **Area riservata** (sidebar richiudibile, drawer su mobile, barra superiore con lingua e tema, menu utente in
  fondo alla sidebar): `/` (home con anteprima), `/profile`.
- **Admin:** `/admin/users` (filtri per stato con conteggi, ricerca, tabella che diventa lista su mobile, menu
  azioni per riga, dialog "Invita utente", conferme con AlertDialog).
- **Errori:** 404, 403.

### 9.2 Stile (dal prototipo approvato)
- Token shadcn in HSL; accento **Laguna** (`--primary: 177 72% 26%` chiaro, `174 58% 48%` scuro), neutri con
  leggera tinta blu-verde, angoli medi (`--radius: 0.625rem`).
- Font **Inter** via `@fontsource-variable/inter` (nessuna richiesta a Google Fonts).
- Bordi dei campi più scuri del default shadcn per il contrasto 3:1 (WCAG 1.4.11).
- Componenti: Button, Input, Label, Field, InputOTP, Card, Alert, Sonner, Dialog, AlertDialog, DropdownMenu,
  Sidebar, Table, Badge, Skeleton, Select.

### 9.3 WCAG 2.2 AA
- 3.3.8 autenticazione accessibile: incolla consentito, `autocomplete` corretti (`username`, `current-password`,
  `new-password`, `one-time-code`), nessun CAPTCHA.
- 2.2.1 tempi: avviso di scadenza sessione con estensione; "Invia nuovo codice" per il codice scaduto.
- Form: label associate, `aria-invalid`, `aria-describedby` sugli errori, focus sul primo campo errato.
- Navigazione: skip link, un `h1` per pagina, titolo, focus e annuncio a ogni cambio pagina.
- Focus visibile e non coperto (2.4.11), target ≥ 24×24 px (2.5.8), contrasto testo 4.5:1 e UI 3:1 in entrambi i temi.
- `<html lang>` aggiornato al cambio lingua; 3.3.7 email precompilata dopo invito e reset; `prefers-reduced-motion`.

## 10. Test e qualità

- **Backend (PHPUnit, MySQL `testing` di Sail):** tutti i casi di §6 compresi i negativi (risposte identiche per
  utenti inesistenti, limiti, codici scaduti/riusati, inviti scaduti/riusati, token mai in chiaro, `403` per ruoli
  non admin, sessioni chiuse su disattivazione/reset, scadenza assoluta con `travel`, lingua, header, campi della
  Resource, comandi di pulizia). `Mail::fake`, `Queue::fake`; HIBP disattivato nei test.
- **Frontend (Vitest + Testing Library + MSW):** client HTTP, form e validazione, `OtpInput`, route protette e
  redirect sicuro, tema e lingua, axe sui componenti di pagina.
- **E2E (Playwright + `@axe-core/playwright`):** login con codice letto dall'API di Mailpit, invito → attivazione →
  login, recupero password; axe su ogni pagina in chiaro e in scuro; login solo da tastiera.
- **Gate:** Pint, **Larastan**, ESLint, `tsc`, `composer audit`, `npm audit`. Prima del rilascio: checklist OWASP ASVS
  L2 (autenticazione e sessioni) e audit `dieffetech-security`.

## 11. Configurazione e dipendenze

### 11.1 Variabili d'ambiente nuove
- Laravel: `FRONTEND_URL`, `SANCTUM_STATEFUL_DOMAINS`, `SESSION_ABSOLUTE_LIFETIME=720`, `AUTH_EVENTS_RETENTION_DAYS=180`,
  `PRIVACY_NOTICE_VERSION=1.0`; in produzione `SESSION_SECURE_COOKIE=true`, `SESSION_COOKIE=__Host-holidays_session`.
- React: `VITE_API_URL` sostituita da `API_PROXY_TARGET` (letta solo da `vite.config.ts`).
- Tutte documentate in `.env.example`.

### 11.2 Dipendenze nuove
- **Backend:** `laravel/fortify`; dev: `laravel-lang/common`, `larastan/larastan`.
- **Frontend:** `react-router`, `i18next`, `react-i18next`, `react-hook-form`, `zod`, `@hookform/resolvers`,
  `tailwindcss`, `@tailwindcss/vite`, componenti shadcn (con `radix-ui`, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react`, `sonner`, `input-otp`), `@fontsource-variable/inter`; dev: `vitest`, `jsdom`,
  `@testing-library/react`, `@testing-library/user-event`, `msw`, `vitest-axe`, `@playwright/test`,
  `@axe-core/playwright`.

### 11.3 Struttura indicativa
- **Laravel:** `app/Enums/`, `app/Models/{User,Invitation,LoginChallenge,AuthEvent}`, `app/Actions/Fortify/`,
  `app/Services/{LoginChallengeService,InvitationService,AuthEventLogger}`, `app/Http/Controllers/{Auth,Admin,Profile}/`,
  `app/Http/Requests/`, `app/Http/Resources/UserResource`, `app/Policies/UserPolicy`,
  `app/Http/Middleware/{SetLocale,SecurityHeaders,EnsureUserIsActive,EnforceAbsoluteSessionLifetime}`,
  `app/Mail/` (Mailable markdown in coda, localizzati), `app/Console/Commands/CreateAdmin`, `lang/{it,en}/`.
- **React:** `src/lib/{api,queryClient,i18n}.ts`, `src/components/ui/` (shadcn), `src/components/layout/{AuthLayout,AppShell}`,
  `src/features/{auth,users,profile}/`, `src/routes.tsx`, `src/providers/ThemeProvider.tsx`, `src/locales/{it,en}.json`.

## 12. Punti aperti (non bloccano l'implementazione)

- **Testo dell'informativa privacy:** da scrivere o validare con il DPO/consulente privacy (la pagina è un segnaposto).
- **Art. 4 Statuto dei Lavoratori:** far confermare al consulente che i log di sicurezza così definiti non richiedono
  accordo sindacale o autorizzazione dell'Ispettorato.
- **Fornitore SMTP di produzione:** da scegliere (con accordo di trattamento dati ex art. 28 GDPR).
- **Deploy:** web server e dominio definitivi; la configurazione degli header della SPA viene documentata ma applicata al deploy.
