# Fase 4: profilo, cambio password, lingua sull'account e avviso di scadenza della sessione

Data: 14/10/2026. Il design è stato approvato in chat dall'utente.

Questa fase chiude il sotto-progetto 1. Completa la spec principale (`2026-09-30-fondamenta-autenticazione-design.md`,
§6.4 e §9.1). Dove le due spec divergono, vale questa.

## 1. Decisioni dell'utente
- **Lingua:** si salva sull'account, così email ed errori del server la seguono e la si ritrova su ogni dispositivo.
- **Tema:** resta per dispositivo, come oggi.
- **Nome e cognome:** ognuno li modifica dal proprio profilo, qualunque sia il ruolo.
- **Email e ruolo:** restano in sola lettura. L'email la cambia un amministratore, e solo finché l'invito non è
  accettato (spec del 14/10, §7.3).
- **Sessioni:** nessun pulsante separato "Esci da tutti gli altri dispositivi". Il cambio password chiude già le altre
  sessioni.
- **Fuori ambito:**
  - cambio della propria email;
  - elenco dei dispositivi collegati;
  - TOTP e passkey (non previsti in questa versione).

## 2. API
Tutte le rotte sono sotto `auth:sanctum`, con gli stessi middleware di oggi: utente attivo e durata assoluta.
Valgono per ogni ruolo e agiscono sempre e solo su chi fa la richiesta.

### 2.1 `GET /api/auth/user`
La risorsa dell'utente corrente aggiunge:
- **`first_name` e `last_name`**, oltre a `name`.
- **`meta.session`**, con due valori:
  - `idle_timeout_seconds`, cioè `config('session.lifetime') * 60`;
  - `absolute_remaining_seconds`, i secondi che restano alla durata assoluta dal login, mai sotto 0. Il server li
    calcola dal timestamp di login in sessione, così l'orologio del dispositivo non conta. Se il timestamp manca, il
    valore è l'intera durata assoluta: il middleware la registra alla prima richiesta.

Per il resto la risposta non cambia. Questa richiesta rinnova la sessione per inattività, come ogni richiesta con
sessione, quindi è anche il "Resta collegato".

### 2.2 `PATCH /api/profile`
- **Campi:** `first_name`, `last_name` e `locale`, tutti `sometimes`.
  - Nome e cognome hanno le stesse regole di invito e Modifica (`PersonRules::name()`), con la stessa pulizia degli
    spazi (`ValidatesInvitee`).
  - `locale` vale `it` o `en`; un altro valore dà 422.
- **Nessuna password richiesta.**
- **Evento:** se cambiano nome o cognome, registra `user_updated` con l'utente stesso come attore e i nomi dei campi
  cambiati, mai i valori. La lingua da sola non produce eventi: è una preferenza, non un dato di sicurezza.
- **Risposta:** 200 con la risorsa dell'utente corrente (`CurrentUserResource` o equivalente, con `meta.session`).
- **Lingua della risposta:** se la richiesta cambia `locale`, la risposta (messaggi compresi) è già nella nuova
  lingua.

### 2.3 `PUT /api/profile/password`
- **Campi:**
  - `current_password`;
  - `password`: `Password::defaults()` (almeno 12 caratteri, mai una password trafugata se configurato), `confirmed`
    e diversa dalla password attuale, altrimenti 422 sul campo `password` con un testo dedicato;
  - `password_confirmation`.
- **Password attuale sbagliata:** 422 su `current_password`. Il blocco è lo stesso di `ConfirmsCurrentPassword`:
  - 5 errori in 15 minuti per utente, poi 429 con `Retry-After`;
  - prenotazione atomica e rilascio quando la password è giusta;
  - il contatore è lo stesso delle azioni degli admin: gli errori si sommano, ed è voluto.
- **Eventi del profilo:** in questo flusso il trait registra i tipi nuovi `password_change_failed` e
  `password_change_locked`, non quelli `admin_*`. Il trait li riceve da un metodo che ogni FormRequest può
  ridefinire.
- **Se va a buon fine**, in una transazione:
  - salva la nuova password (hash);
  - cancella tutte le altre sessioni dell'utente dalla tabella `sessions`, tranne la corrente;
  - cancella i token di recupero password dell'utente;
  - registra l'evento `password_changed` (esiste già).

  Dopo il commit:
  - rigenera l'id della sessione corrente, così l'utente resta collegato;
  - invia in coda `PasswordChangedMail` (esiste già, con user agent e ora) nella lingua dell'utente. Il testo dice
    "se non sei stato tu, usa Password dimenticata e avvisa un amministratore".
- **Risposta:** 204.
- **Limite per IP:** nessun limite nuovo. Valgono il limite API di 60 richieste al minuto per utente e il blocco
  sulla password.

### 2.4 Lingua del server
`SetLocale` usa già `users.locale`: non cambia.

## 3. Frontend

### 3.1 Lingua
- **Dopo il login, e al caricamento con una sessione valida:** se `user.locale` è diversa dalla lingua attiva,
  l'interfaccia passa a quella dell'account e la salva anche nel browser.
- **Cambio di lingua da collegati,** sia dal profilo sia dal menu lingua della barra in alto:
  - cambia subito l'interfaccia;
  - salva con `PATCH /api/profile { locale }`;
  - se il salvataggio fallisce, compare un toast di errore e l'interfaccia resta nella lingua scelta. Al caricamento
    successivo vince l'account.
- **Da ospite** (login, recupero password, invito): la lingua resta quella del browser, come oggi.

### 3.2 Pagina `/profile`
Si apre da una voce "Profilo" nel menu account, prima di "Esci". È una route protetta per tutti i ruoli.
`PageHeading` mostra "Profilo".

La pagina ha tre blocchi (card). Su desktop sono larghe al massimo come le pagine di lettura; sul telefono vanno in
colonna:
1. **Dati personali:**
   - Nome e Cognome modificabili, con "Salva";
   - Email e Ruolo in sola lettura, con la nota "L'email la cambia un amministratore.";
   - salvato il nome, la sidebar si aggiorna subito.
2. **Password:**
   - Password attuale, Nuova password e Conferma, con `PasswordInput` (l'occhio per mostrarla);
   - la regola "Almeno 12 caratteri" è visibile e collegata al campo;
   - "Cambia password";
   - stesse protezioni dei dialog: niente doppio invio, 422 sotto i campi con il focus sul primo errore, 429 con il
     pulsante bloccato ma raggiungibile da tastiera (`aria-disabled`);
   - se va a buon fine: toast "Password cambiata. Le altre sessioni sono state chiuse." e campi svuotati.
3. **Preferenze:**
   - Lingua: radio Italiano o English, salvata sull'account (§3.1);
   - Tema: radio Chiaro, Scuro o Sistema, con la nota "Vale per questo dispositivo." (`next-themes`, come il menu in
     alto).

Ogni salvataggio ha il suo toast (verde o rosso). WCAG 2.2 AA:
- etichette, `autocomplete` (`current-password` e `new-password`), errori collegati;
- axe in chiaro e in scuro;
- 360 px senza scorrimento orizzontale.

### 3.3 Avviso di scadenza della sessione (WCAG 2.2.1)
- **Ultima attività:**
  - si aggiorna a ogni risposta API riuscita con la sessione (`src/lib/api.ts`);
  - sta in `localStorage` (chiave dedicata). L'evento `storage` la condivide tra le schede, così chi lavora in
    un'altra scheda non vede l'avviso;
  - se `localStorage` non è disponibile, ogni scheda usa la propria memoria.
- **Scadenza per inattività:** è l'ultima attività più `idle_timeout_seconds`.
- **Scadenza assoluta:** si calcola alla lettura di `/api/auth/user` come "adesso + `absolute_remaining_seconds`",
  con l'orologio del dispositivo solo per misurare il tempo trascorso.
- **Avviso:** un unico componente montato nell'area riservata (`AppShell`) apre un AlertDialog 120 secondi prima della
  prima delle due scadenze.
  - **Inattività:**
    - titolo "La sessione sta per scadere";
    - conto alla rovescia in minuti e secondi;
    - "Resta collegato" chiama `GET /api/auth/user` (rinnova la sessione e aggiorna l'ultima attività) e chiude
      l'avviso;
    - "Esci" fa il logout normale.
  - **Durata assoluta:**
    - testo "Tra poco dovrai accedere di nuovo: salva il lavoro.";
    - solo "Ho capito", perché non si può prolungare;
    - se l'utente lo chiude, non riappare per la stessa scadenza.
  - **Lettori di schermo:** il conto alla rovescia non viene annunciato ogni secondo. Ci sono una regione live
    `polite` all'apertura e un annuncio a 30 secondi.
  - **Tra schede:** se un'altra scheda rinnova la sessione, l'avviso si chiude da solo.
- **Alla scadenza** (il conto arriva a 0 senza rinnovo):
  - il client chiude la sessione locale come per un 401 con `session_expired` (`lib/sessionEnd.ts`);
  - porta a `/login` con il messaggio "Sessione scaduta" e il ritorno alla pagina di partenza;
  - non serve chiamare il server.
- **Timer:** un solo `setTimeout` ricalcolato a ogni cambio di ultima attività o di scadenza, mai un polling di rete.
  Il conto alla rovescia visibile si aggiorna una volta al secondo solo mentre l'avviso è aperto.

## 4. Dati
- **Migrazioni:** nessuna. `users.locale` esiste già.
- **Enum:** `AuthEventType` aggiunge `PasswordChangeFailed` (`password_change_failed`) e `PasswordChangeLocked`
  (`password_change_locked`).
- **Seeder di sviluppo:** aggiunge `profile@holidays.test`, un dipendente attivo con la password di sviluppo, usato
  solo dagli E2E del profilo. L'E2E rimette la password a fine test.

## 5. Test
- **Backend (PHPUnit):**
  - ogni ruolo modifica solo sé stesso; 401 da ospite;
  - validazioni (nome, cognome, locale) ed evento `user_updated` senza valori;
  - password:
    - attuale sbagliata (422 ed evento `password_change_failed`);
    - blocco (429 ed evento `password_change_locked`);
    - uguale alla vecchia (422);
    - troppo corta e conferma diversa (422);
    - se va a buon fine: le altre sessioni sono cancellate e la corrente no, i token di recupero sono cancellati,
      l'evento `password_changed` è registrato e l'email parte in coda;
  - lingua salvata e usata nella risposta e nelle email;
  - `meta.session`, anche senza timestamp di login e oltre la scadenza (0).
- **Frontend (Vitest, MSW, orologio finto):**
  - pagina profilo con i tre blocchi, errori, blocco e sidebar aggiornata;
  - lingua sincronizzata al login e al cambio, compreso l'errore di salvataggio;
  - avviso:
    - compare a 1h58 di inattività;
    - "Resta collegato" rinnova la sessione;
    - l'attività di un'altra scheda chiude l'avviso;
    - scadenza assoluta con "Ho capito";
    - redirect alla scadenza;
  - axe.
- **E2E (Playwright):**
  - `profile@holidays.test` cambia password, esce e rientra con la nuova (codice da Mailpit), poi la rimette;
  - cambio lingua che resta dopo logout e login;
  - axe in chiaro e in scuro su `/profile`;
  - 360 px senza scorrimento orizzontale.

## 6. Reset della password avviato da admin o responsabile (aggiunta del 14/10)
**Decisione dell'utente:** si invia solo il link. La password attuale resta valida finché la persona non la cambia;
il reset avviato da altri non blocca l'account e non chiude le sessioni.

### 6.1 Sicurezza
- **Destinatario del link:** solo l'email registrata della persona (`users.email`), mai chi agisce. Chi agisce non
  vede e non sceglie mai la password altrui.
- **Il resto segue il flusso di "Password dimenticata", che esiste già:**
  - token del broker, valido 60 minuti;
  - nuova password con le regole di sempre;
  - dopo il reset tutte le sessioni si chiudono e i login in attesa del codice vengono cancellati;
  - si rientra con password e codice via email.
- **Limiti:** gli stessi del link pubblico, con lo stesso contatore per account. Le richieste pubbliche e quelle degli
  admin si sommano, così nessuno può inondare una casella di email:
  - 60 secondi tra due link (broker);
  - al massimo 5 link l'ora per account.

  Qui chi agisce è autenticato, quindi l'esito si comunica: un limite superato dà 429, con il messaggio e
  `Retry-After`.

### 6.2 API
`POST /api/users/{user}/password-reset`:
- **Policy `sendPasswordReset`:** stesse regole di `disable`. Il responsabile la usa sui non admin, l'admin su
  chiunque; nessuno su sé stesso (per sé c'è il profilo).
- **Flag:** `can.send_password_reset` in `ManagedUserResource`.
- **Stato:** solo per utenti `active`, altrimenti 409 `users.not_active`. Per un invitato c'è "Reinvia invito".
- **Admin come destinatario:** se il destinatario, riletto sotto blocco, è un altro admin:
  - serve `current_password`, con il blocco di `ConfirmsCurrentPassword` e gli eventi `admin_*`;
  - dopo il commit parte l'email di avviso agli altri admin attivi, mai a chi agisce, con il nuovo tipo
    `AdminChange::PasswordResetSent`;
  - se il destinatario diventa admin tra la richiesta e il blocco e la password non è stata chiesta: 409
    `users.state_changed`.
- **Evento:** `password_reset_sent` (nuovo), con il destinatario e chi agisce.
- **Email al destinatario:**
  - è `ResetPasswordMail`, nella lingua del destinatario;
  - ha una riga in più: "Il link è stato richiesto da un amministratore o dal tuo responsabile: se non te
    l'aspettavi, ignora questa email e avvisa un amministratore";
  - non riporta mai il nome di chi agisce.
- **Risposta:** 202, senza corpo.

### 6.3 Interfaccia
- **Utenti:** voce "Invia reset password" nel menu di riga degli utenti attivi, secondo `can.send_password_reset`.
- **Amministratori:** pulsante "Reset password" sugli altri admin attivi, con colore neutro.
- **Conferma:** `ConfirmUserActionDialog`, con l'azione nuova `passwordReset`:
  - titolo "Inviare il link per reimpostare la password a {nome}?";
  - descrizione "Riceverà un'email a {email} con un link valido 60 minuti. La password attuale resta valida finché
    non la cambia.";
  - la password si chiede solo per un altro admin.
- **Esito:** toast verde "Link inviato a {email}."; un 429 dà toast rosso con il messaggio del server.

### 6.4 Test
- **Backend:**
  - matrice dei permessi;
  - 409 per utenti non attivi;
  - password e avviso agli admin quando il destinatario è un admin;
  - limiti condivisi con il link pubblico (429);
  - email al solo destinatario, con la riga in più e senza il nome di chi agisce;
  - evento;
  - la password resta valida e le sessioni restano aperte.
- **Frontend:** voce di menu e pulsante secondo `can` e stato, dialog con e senza password, toast, 429.
- **E2E:** l'admin invia il reset a `employee@holidays.test` e l'email arriva in Mailpit a quell'indirizzo, con il
  link.
