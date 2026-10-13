# Fase 3 — Inviti, gestione utenti e amministratori

- **Data:** 13 ottobre 2026
- **Stato:** in revisione
- **Spec principale:** `2026-09-30-fondamenta-autenticazione-design.md`. Vale tutto quello che dice, tranne i punti che questo documento cambia o aggiunge (segnati con **Novità** o **Cambia**).
- **Branch:** `feature/auth-fase-3`, creato da `feature/auth-fase-2`.

## 1. Obiettivo

Un admin invita dipendenti e responsabili, che attivano l'account dal link ricevuto via email. Lo stesso admin gestisce
gli utenti (reinvia, annulla, cambia ruolo, disattiva, riattiva) e, in una sezione dedicata, nomina e revoca gli altri
admin con protezioni rafforzate. Il primo admin nasce da un comando artisan.

**Fuori perimetro:** profilo e cambio password dal profilo, avviso di scadenza della sessione, pulizie programmate (tutto
nella fase 4). Ferie, sedi e calendari restano nel sotto-progetto 3.

## 2. Decisioni prese con l'utente (13/10/2026)

| Tema | Decisione |
|---|---|
| Ruoli all'invito | **Cambia:** l'invito crea solo `employee` o `manager`. Si diventa `admin` solo per promozione di un utente attivo. Eccezione: `app:create-admin`, che serve a creare il primo admin |
| Sezione admin | **Novità:** pagina dedicata `/admin/administrators` per l'elenco degli admin, la promozione e la revoca |
| Revoca | Nel dialog si sceglie il nuovo ruolo (`employee` o `manager`), con `employee` proposto. Il ruolo precedente non viene salvato |
| Cambio ruolo | **Novità:** azione "Cambia ruolo" tra `employee` e `manager` nella gestione utenti. Mai su un admin, mai su sé stessi |
| Protezioni admin | Per promuovere, revocare, disattivare o riattivare un admin servono la propria password, un'email alla persona e a tutti gli altri admin attivi, la regola "mai zero admin" e un evento nel log di sicurezza con chi ha agito |
| Attivazione invito | **Cambia (§6.1 punto 4):** dopo "Attiva account" parte subito il passo del codice, come dopo il reset password (§6.3). Si va su `/login/verify` e poi nella dashboard. L'attivazione non apre mai la sessione da sola |
| Ultimo accesso | Nella gestione utenti non si mostra né si espone `last_login_at`: vale il limite di finalità di §7.3, niente schermate di presenza o attività |

## 3. Dati

### 3.1 Tabella `invitations` (come spec §7.1)
`id`, `user_id` (FK cascade), `token_hash` (char 64, unique, SHA-256 del token), `invited_by` (FK users, null on delete),
`expires_at`, `accepted_at` nullable, `last_sent_at`, `timestamps`.

- Un solo invito per utente: il reinvio aggiorna la riga (nuovo hash, nuova scadenza, nuovo `last_sent_at`).
- Il token è di 64 caratteri casuali (`Str::random(64)`) e non viene mai salvato in chiaro.

### 3.2 `auth_events` — **Novità**
Nuova colonna `actor_id` (FK users, nullable, null on delete): chi ha compiuto l'azione. `user_id` resta chi la subisce.
Si aggiunge con una nuova migration, perché la tabella esiste già.

### 3.3 Enum `AuthEventType` — **Novità**
Nuovi casi `InvitationCancelled`, `RoleChanged`, `AdminGranted`, `AdminRevoked`. I casi `InvitationSent`,
`InvitationAccepted`, `UserDisabled` e `UserEnabled` esistono già.

### 3.4 Utenti
Nessuna colonna nuova: `privacy_notice_version`, `privacy_notice_acknowledged_at` ed `email_verified_at` esistono già.
`role` e `status` si impostano solo nei service con `forceFill`.

## 4. API

### 4.1 Area admin
Tutte le rotte qui sotto richiedono `auth:sanctum`, l'utente attivo (`EnsureUserIsActive`) e la `UserPolicy`. Limite di
60 richieste al minuto per utente.

| Metodo e percorso | Esito |
|---|---|
| `GET /api/users?filter[status]=&search=&page=` | `200`, paginato a 25 per pagina, con `meta.counts` per stato (`all`, `active`, `invited`, `disabled`) |
| `POST /api/users` `{name, email, role}` | `201`, invito creato e inviato. `role` è solo `employee` o `manager` · `422` (email già registrata, ruolo non ammesso) |
| `POST /api/users/{user}/invitation` | `202`, reinvio. Solo utenti `invited` · `429 {retry_after}` se l'ultimo invio ha meno di 60 s · `409` se l'utente non è invitato |
| `DELETE /api/users/{user}/invitation` | `204`, cancella utente e invito. Solo utenti `invited` (altrimenti `409`) |
| `PATCH /api/users/{user}/role` `{role}` | `200`. `role` è solo `employee` o `manager` · `403` su un admin o su sé stessi |
| `POST /api/users/{user}/disable` | `200` · `403` su sé stessi · `422` sull'ultimo admin attivo. Se l'utente è un admin, serve anche `current_password` |
| `POST /api/users/{user}/enable` | `200`. Se l'utente è un admin, serve anche `current_password` (riattivare un admin gli restituisce i poteri) |
| `GET /api/administrators` | `200`, elenco degli admin (attivi e disattivati) |
| `POST /api/administrators` `{user_id, current_password}` | `200`. Promuove un utente `active` non admin |
| `DELETE /api/administrators/{user}` `{role, current_password}` | `200`. Revoca · `403` su sé stessi · `422` sull'ultimo admin attivo |

- **Resource della gestione utenti (`ManagedUserResource`):** `id`, `name`, `email`, `role`, `role_label`, `status`,
  `status_label`, `invitation_expires_at` (solo per gli invitati), `is_current_user`. Mai `last_login_at`, token, hash
  o password. `UserResource`, usata per l'utente corrente, non cambia.
- **Password di conferma:** campo `current_password` nel corpo, verificato con la regola `current_password:web`.
  - Dopo 5 errori in 15 minuti per lo stesso admin: `429`.
  - Non si usa la conferma a sessione di Fortify (rotte spente nella fase 2).

### 4.2 Pagine pubbliche dell'invito (gruppo `web`, `guest:web`, 10/min per IP)

| Metodo e percorso | Esito |
|---|---|
| `GET /api/invitations/{token}` | `200 {name, email, expires_at}` · `404` se il token non esiste, l'invito è già usato o annullato · `410` se è scaduto |
| `POST /api/invitations/{token}/accept` `{password, password_confirmation, privacy_acknowledged}` | `200 {two_factor: true, message}`. Poi la SPA va su `/login/verify` · `422` · `404` · `410` |

`privacy_acknowledged` deve valere `true` (regola `accepted`). Si salvano `privacy_notice_version`
(`PRIVACY_NOTICE_VERSION`) e `privacy_notice_acknowledged_at`.

### 4.3 Comando
`sail artisan app:create-admin {name} {email}`:
- crea un utente `admin` con stato `invited` e il relativo invito, e manda l'email di invito;
- non chiede né stampa password;
- rifiuta un'email già registrata.

## 5. Flussi

### 5.1 Invito
1. L'admin invia nome, email e ruolo. In una transazione nascono l'utente `invited` senza password e l'invito, poi parte
   l'email (in coda, dopo il commit, cifrata perché contiene il token) con il link `FRONTEND_URL/invitation/{token}`.
2. Eventi registrati: `invitation_sent` (con `actor_id`).

### 5.2 Attivazione
1. La SPA legge nome ed email dall'invito.
2. L'utente sceglie password e conferma (regole di §8.2: min 12, `uncompromised`) e spunta la presa visione
   dell'informativa.
3. In una transazione:
   - password;
   - stato `active`;
   - `email_verified_at`;
   - campi dell'informativa;
   - `accepted_at`;
   - evento `invitation_accepted`.
4. Poi `LoginChallengeService::beginFor($request, $user, reportMailFailure: true)`: challenge in sessione e codice via
   email. La risposta è `200 {two_factor: true}`.
5. Il link funziona una sola volta. Un invito annullato o già usato dà `404`, uno scaduto dà `410`.

### 5.3 Reinvio e annullamento
- **Reinvio:**
  - nuovo token, scadenza a 72 ore da ora, vecchio link non più valido;
  - al massimo un invio ogni 60 s per invito;
  - evento `invitation_sent`.
- **Annullamento:** cancella utente e invito (solo se mai attivato), con evento `invitation_cancelled`. L'evento si
  registra con `user_id` null e `actor_id`, perché l'utente non esiste più.

### 5.4 Cambio ruolo
Solo tra `employee` e `manager`, mai su un admin e mai su sé stessi. Evento `role_changed`. Effetto immediato, perché i
controlli leggono il ruolo a ogni richiesta.

### 5.5 Disattivazione e riattivazione
- **Disattivazione:**
  - stato `disabled`;
  - `AuthSession::endAllFor($user)`;
  - cancellazione di challenge pendenti e righe di `password_reset_tokens` dell'utente;
  - evento `user_disabled`.
  - Su un admin vale anche §5.6.
- **Riattivazione:** stato `active`, evento `user_enabled`. Non si possono riattivare utenti `invited`.

### 5.6 Admin: promozione, revoca, disattivazione e riattivazione di un admin
1. Si controlla `current_password` dell'admin che agisce, con il limite di 5 errori in 15 minuti.
2. Transazione con blocco (`lockForUpdate`) sulle righe degli admin attivi. La regola "mai zero admin" si verifica dentro
   il blocco, così due revoche contemporanee non possono lasciare l'app senza admin.
3. Si applica il cambio:
   - promozione: `role = admin`;
   - revoca: `role` scelto;
   - disattivazione o riattivazione: §5.5.
4. Eventi `admin_granted`, `admin_revoked`, `user_disabled` o `user_enabled`, con `actor_id`.
5. Dopo il commit parte l'email (in coda) alla persona interessata e a tutti gli altri admin attivi. Contiene chi ha agito,
   cosa ha fatto, su chi e quando, e "se non era previsto, avvisa subito il responsabile IT".

## 6. Permessi (`UserPolicy` nativa, metodi bool senza effetti collaterali)

| Metodo | Regola |
|---|---|
| `viewAny`, `create` | attore admin |
| `resendInvitation`, `cancelInvitation` | attore admin, target `invited` |
| `changeRole` | attore admin, target non admin e non sé stesso |
| `disable` | attore admin, target non sé stesso e non `invited` |
| `enable` | attore admin, target `disabled` |
| `grantAdmin` | attore admin, target `active` e non admin |
| `revokeAdmin` | attore admin, target admin e non sé stesso |

La regola "mai l'ultimo admin" non sta nella policy: la applica il service dentro la transazione bloccante, con `422`.

## 7. Interfaccia

### 7.1 Navigazione
Nel menu laterale, solo per gli admin, il gruppo "Amministrazione" con "Utenti" e "Amministratori". Le route admin sono
protette da una `AdminRoute`; chi non è admin vede la pagina 403.

### 7.2 `/admin/users`
- **Intestazione:** titolo, pulsante "Invita utente", schede con conteggi (Tutti, Attivi, Invitati, Disattivati) e
  ricerca per nome o email, con aggiornamento dopo 300 ms. Filtro, ricerca e pagina stanno nell'URL.
- **Tabella:** colonne Persona (nome ed email), Ruolo, Stato (badge testuali, mai il solo colore) e Dettagli (per gli
  invitati "Invito scade il…"). Su mobile diventa una lista di schede senza scroll orizzontale. Paginazione da 25 righe.
- **Menu azioni per riga, con le sole azioni permesse:** Reinvia invito, Annulla invito, Cambia ruolo, Disattiva,
  Riattiva. Sulla propria riga il badge "Tu" e nessuna azione.
- **Dialog "Invita utente":** nome, email e ruolo (dipendente o responsabile). Errori sotto i campi, messaggio di esito
  e lista aggiornata.
- **Conferme con AlertDialog:**
  - testo esplicito ("Disattiva Marco Bianchi");
  - pulsante distruttivo per annullare un invito o disattivare;
  - per un admin, il campo "La tua password" nello stesso dialog.
- **Stati:** skeleton durante il caricamento, vuoto con "Azzera filtri", errore con "Riprova".

### 7.3 `/admin/administrators`
- **Elenco:** nome, email, stato, badge "Tu", pulsante "Revoca" per gli altri.
- **"Aggiungi admin":** dialog con ricerca tra gli utenti attivi non admin e il campo "La tua password".
- **"Revoca":** dialog con il nuovo ruolo (dipendente preselezionato) e "La tua password".
- **Ultimo admin attivo:** "Revoca" disattivato, con una nota che spiega che serve almeno un admin.
- **Testo in pagina:** ogni modifica viene comunicata via email a tutti gli admin.

### 7.4 Pagine pubbliche (layout di accesso)
- **`/invitation/:token`:**
  - "Benvenuto, {nome}";
  - email in sola lettura con aspetto attenuato;
  - nuova password e conferma (`new-password`);
  - casella "Ho preso visione dell'informativa privacy", con link a `/privacy` in una nuova scheda;
  - pulsante "Attiva account".
  - Poi `/login/verify` con l'avviso "Account attivato. Per entrare inserisci il codice che ti abbiamo inviato.".
- **Link scaduto o non valido:** messaggio dedicato, "Chiedi all'ufficio HR un nuovo invito" e link al login.
- **`/privacy`:** testo segnaposto (§12 della spec principale).
- **Errore 403:** "Non hai i permessi per questa pagina" e il ritorno alla home.

### 7.5 Accessibilità
WCAG 2.2 AA come nelle fasi 1 e 2:
- dialog con focus intrappolato, che torna sul pulsante di origine alla chiusura;
- esiti annunciati;
- menu azioni usabili da tastiera;
- target ≥ 24 px;
- contrasto verificato in chiaro e in scuro;
- un `h1` per pagina con focus al cambio di pagina.

## 8. Test

### 8.1 Backend (PHPUnit)
- **Matrice dei codici su ogni rotta:** `401`, `403` (employee, manager, azioni su sé stessi), `404`, `409`, `422`, `429`.
- **Inviti:**
  - token solo come hash;
  - scadenza a 72 ore;
  - il reinvio annulla il vecchio link, con il limite di 60 s;
  - annullamento solo sugli invitati;
  - attivazione completa con codice avviato;
  - link usabile una volta;
  - ruolo admin rifiutato all'invito;
  - email in coda e cifrata.
- **Admin:**
  - password giusta e sbagliata, blocco dopo 5 errori;
  - mai zero admin, anche con disattivazione;
  - email alla persona e agli altri admin;
  - `actor_id` nel log;
  - un admin revocato riceve `403` alla richiesta successiva.
- **Disattivazione:** sessioni, challenge e token di reset cancellati.
- **Altro:**
  - comando `app:create-admin`;
  - campi di `ManagedUserResource`, senza `last_login_at`.

### 8.2 Frontend (Vitest + MSW + axe)
- **Pagina utenti:**
  - URL sincronizzato con filtri, ricerca e pagina;
  - azioni del menu per stato e ruolo;
  - dialog con errori del server sotto i campi.
- **Pagina amministratori:**
  - promozione e revoca con password;
  - "Revoca" disattivato con un solo admin.
- **Attivazione:** link valido, scaduto e non valido.
- **Navigazione e accessibilità:**
  - `AdminRoute` e pagina 403;
  - axe su pagine e dialog.

### 8.3 E2E (Playwright, database di sviluppo, senza `migrate:fresh`)
- **Flusso completo:** l'admin invita un'email unica → l'email arriva su Mailpit → attivazione → codice → home del nuovo
  utente.
- **Sezione admin:** promozione con email agli admin → revoca.
- **Disattivazione:** la sessione aperta dell'utente disattivato viene chiusa.
- **Interfaccia:**
  - WCAG in chiaro e in scuro sulle nuove pagine;
  - lista, menu e dialog solo da tastiera;
  - niente scroll orizzontale a 360 px.
- **Pulizia:** gli utenti creati dai test vengono annullati o disattivati.

### 8.4 Gate
Pint, Larastan, ESLint, build (`tsc`) e `npm audit`. Una revisione per ogni task, poi code review e security review
finali. Controllo visivo con Playwright a 360, 768 e 1280 px.

## 9. Configurazione
- **Da aggiungere:** `PRIVACY_NOTICE_VERSION=1.0`, prevista dalla spec principale (§11.1) ma non ancora presente.
  Va in `.env.example` e si legge solo da `config/`.
- Nessuna dipendenza nuova lato backend. Lato frontend si aggiungono i componenti shadcn che mancano: Dialog, AlertDialog,
  Table, Select, Checkbox, Tabs, Command o Popover per la ricerca degli utenti. Tutti con la CLI `shadcn@4.21.0`, come
  nella fase 1.
