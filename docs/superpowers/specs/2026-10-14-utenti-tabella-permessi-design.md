# Tabella utenti avanzata, permessi del responsabile e invito di nuovi admin

Data: 14/10/2026. Approvato dall'utente in chat. Integra la spec della fase 3
(`2026-10-13-fase-3-inviti-utenti-admin-design.md`) e la prevale dove diverge.

## 1. Decisioni dell'utente
- Il **responsabile** gestisce gli utenti come l'admin, **tranne gli admin**. Non vede la sezione Amministratori.
- Il **dipendente** vede Home e Ferie e permessi.
- Un **nuovo admin** si può creare anche con un invito ("Nuova persona"), oltre alla promozione di un utente esistente.
  Questo supera la regola della fase 3 "admin solo per promozione".
- La **tabella utenti** usa la Data Table di shadcn (TanStack Table), con ordinamento, filtri e paginazione lato server.
  - Le tab di stato restano.
  - Si aggiungono i filtri Nome, Email e Ruolo.
- La **voce attiva del menu** si deve riconoscere in tutti e due i temi.
- Le **pagine con tabelle** usano tutta la larghezza.

## 2. Permessi

| Funzione | Dipendente | Responsabile | Admin |
|---|---|---|---|
| Home, Ferie e permessi | ✓ | ✓ | ✓ |
| Sezione Utenti (`/users`): lista, filtri | – | ✓ (vede anche gli admin) | ✓ |
| Invitare dipendenti e responsabili | – | ✓ | ✓ |
| Reinviare o annullare inviti | – | ✓, non di admin | ✓ |
| Cambiare ruolo tra dipendente e responsabile | – | ✓, non a sé stesso né ad admin | ✓, non a sé stesso né ad admin |
| Disattivare | – | ✓, non sé stesso né admin | ✓, non sé stesso (gli admin con le protezioni della fase 3) |
| Riattivare | – | ✓, non admin | ✓ |
| Sezione Amministratori (`/admin/administrators`) | – | – | ✓ |

- **Policy:** `UserPolicy` per tutte le regole. Abilità nuova `manageAdministrators`, solo admin: vale per la lista,
  la promozione, l'invito e la revoca degli admin.
- **403 e 409:** 403 quando non puoi agire su quella persona, 409 quando il suo stato non lo consente (come nella
  fase 3).
- **Controllo sotto blocco:** il servizio, dopo aver bloccato il destinatario, ricontrolla anche il permesso. Un
  responsabile che agisce su un utente diventato admin nel frattempo riceve 409 `users.state_changed`.
- **Azioni ammesse per riga:** ogni riga di `ManagedUserResource` espone `can` con le azioni permesse a chi guarda:
  `resend_invitation`, `cancel_invitation`, `change_role`, `disable`, `enable`.
  - Le calcola il Gate per l'utente della richiesta, senza query.
  - Il frontend le usa insieme allo stato: non ricalcola le regole dei ruoli.

## 3. API della lista utenti
`GET /api/users`:
- `filter[name]` e `filter[email]`: testo, ricerca "contiene" senza distinzione di maiuscole, al massimo 100 caratteri;
- `filter[role]`: `employee`, `manager` o `admin`;
- `filter[status]`: `active`, `invited` o `disabled`;
- `sort`: `name`, `email`, `role`, `status`, ognuno anche con il prefisso `-` per l'ordine decrescente. Il default è
  `name`. Lo spareggio è sempre `id`. Il ruolo si ordina per gerarchia (dipendente, responsabile, admin), lo stato per
  attivo, invitato, disattivato;
- `page` e `per_page` (10, 25 o 50; default 25);
- valori non validi danno 422 (FormRequest, `Rule::enum`). Il vecchio parametro `search` sparisce.

Risposta: la paginazione standard di Laravel, più `meta.counts` (`all`, `active`, `invited`, `disabled`).
- I conteggi rispettano nome, email e ruolo, non lo stato.
- Quando la pagina richiesta supera l'ultima, il frontend torna all'ultima.

## 4. Invito di un nuovo admin
`POST /api/administrators/invitations` con `name`, `email`, `current_password`:
- è riservato all'admin (`manageAdministrators`);
- valida nome ed email come l'invito normale, più la password di conferma con il blocco della fase 3;
- crea un utente con ruolo `admin` e stato `invited` e invia il solito link (72 ore);
- registra l'evento `admin_invited` e manda un'email agli altri admin attivi, mai a chi agisce, come per la promozione;
- risponde 201 con `ManagedUserResource`.

Comportamento dopo l'invio:
- all'attivazione l'account diventa un admin attivo, dopo il passo del codice come tutti;
- reinvio e annullamento di un invito admin restano negli endpoint esistenti `/api/users/{user}/invitation`, solo per
  l'admin;
- la pagina Amministratori mostra anche gli admin con l'invito ancora da attivare, con Reinvia e Annulla.

## 5. Interfaccia
- **Navigazione:**
  - gruppo "Gestione" con Utenti (responsabile e admin) e Amministratori (solo admin);
  - `/admin/users` fa redirect a `/users` mantenendo la query string;
  - guardia di route per ruoli (`RoleRoute`).
  - Il dipendente che apre `/users` vede la pagina 403.
- **Voce attiva del menu:** sfondo pieno, testo in grassetto, barra colorata a sinistra e `aria-current="page"`, con
  contrasto AA in tutti e due i temi.
- **Larghezza:** il contenuto dell'area riservata non ha più il `max-w-6xl`. Le pagine di solo testo (home, privacy)
  mantengono una larghezza di lettura.
- **Tabella utenti:**
  - barra filtri con Nome, Email (con debounce e salvati nell'URL), select Ruolo e "Azzera filtri", più le tab di
    stato con i conteggi;
  - intestazioni ordinabili con `aria-sort`;
  - paginazione con prima, precedente, successiva e ultima, "Pagina X di Y", righe per pagina e totale;
  - su mobile schede, con la select "Ordina per";
  - stato completo nell'URL, compatibile con Indietro e Avanti del browser.
- **Dialog "Aggiungi amministratore":** sceglie tra "Utente esistente" e "Nuova persona" (nome ed email). La password
  di conferma vale per entrambi.

## 6. Test
- **Backend:**
  - matrice dei permessi per ruolo (dipendente, responsabile, admin, su destinatari dipendente, responsabile, admin e
    sé stessi);
  - filtri, ordinamento, paginazione e 422;
  - invito admin, con password, email agli admin ed evento.
- **Frontend:** Vitest su tabella, filtri, URL, permessi per riga, navigazione per ruolo e dialog admin.
- **E2E:**
  - il responsabile vede Utenti ma non Amministratori;
  - il dipendente non vede nessuna delle due;
  - l'admin invita un nuovo admin;
  - filtri e ordinamento della tabella.
- **Controlli finali:** axe in chiaro e scuro e schermo a 360 px.

## 7. Aggiornamento del 14/10/2026 (seconda richiesta dell'utente)

### 7.1 Nome e cognome separati
- **Database:** `users` passa da `name` a `first_name` e `last_name`, con una migration nuova (non si modificano quelle
  esistenti). Nessuna migration è ancora in produzione.
  - I dati esistenti si dividono al primo spazio: la prima parola è il nome, il resto il cognome. Se c'è una sola
    parola, il cognome resta vuoto.
  - Il nome completo per la visualizzazione e le email è un accessor `name` ("Nome Cognome"), così i template non
    cambiano.
- **API:**
  - le risorse utente espongono `first_name`, `last_name` e `name` (completo);
  - invito, invito admin e modifica ricevono `first_name` e `last_name`, entrambi obbligatori per i nuovi dati, con le
    stesse regole di oggi su `name`;
  - `app:create-admin {first_name} {last_name} {email}`.

### 7.2 Ricerca generale e filtri
- **`filter[search]`:** il testo si divide in parole. Ogni parola deve comparire in nome, cognome o email (AND tra le
  parole, OR tra i campi). "Mario Rossi", "Rossi Mario" e "rossi@" funzionano tutti. Contano le prime 5 parole
  distinte, le successive si ignorano.
- **Filtri per campo:** `filter[first_name]`, `filter[last_name]` e `filter[email]` sostituiscono `filter[name]`.
  `filter[role]` e `filter[status]` restano.
- **`sort`:** `first_name`, `last_name`, `email`, `role` e `status`, con `-` per l'ordine decrescente. Il default è
  `last_name` con spareggio `first_name`, poi `id`.
- **Conteggi:** rispettano ricerca, nome, cognome, email e ruolo.
- **Interfaccia:**
  - la ricerca generale è sempre visibile;
  - il pulsante "Filtri" (`aria-expanded`, numero dei filtri attivi) apre il pannello con Nome, Cognome, Email, Ruolo
    e "Azzera filtri". Il pannello si apre da solo se l'URL ha filtri attivi;
  - le tab di stato restano visibili;
  - colonne su desktop: Nome, Cognome, Email (ordinabili), Ruolo, Stato, Dettagli e azioni.

### 7.3 Modifica utente
- **Endpoint:** `PATCH /api/users/{user}` con `first_name`, `last_name` ed `email` facoltativa.
  - L'email si può cambiare solo per gli utenti `invited`: si aggiorna, si rigenera il link d'invito con l'invio al
    nuovo indirizzo e il vecchio link smette di valere.
  - Il cambio di email è un nuovo invio: rispetta la stessa attesa del reinvio (60 secondi dall'ultimo invio), altrimenti
    429 con `Retry-After` e `meta.retry_after`, come il reinvio.
  - Per gli altri stati un'email diversa da quella attuale dà 422 sul campo, con un testo che spiega il motivo.
  - Email unica.
- **Permesso `update`:** l'admin su chiunque, sé stesso compreso; il responsabile su chi non è admin, sé stesso
  compreso. Flag `can.update` per riga.
- **Log:** evento `user_updated` con l'attore e i nomi dei campi cambiati, mai i valori.
- **Admin come destinatario** (parità con promozione, invito e revoca):
  - se il destinatario, riletto sotto blocco, è un admin diverso da chi agisce, serve `current_password` con lo stesso
    blocco della fase 3 (5 errori in 15 minuti, eventi `admin_password_failed` e `admin_password_locked`); senza, 422
    su `current_password`;
  - se il destinatario diventa admin tra la richiesta e il blocco e la password non è stata chiesta: 409
    `users.state_changed`;
  - se cambia l'email di un admin (invitato): email di avviso a tutti gli altri admin attivi dopo il commit, mai a chi
    agisce, oltre all'evento `user_updated`;
  - nessuna password per modificare sé stessi (solo nome e cognome: la propria email non è da invitato, quindi non
    cambia) né per i destinatari non admin;
  - il contratto della risorsa non cambia: il frontend chiede la password se `role === 'admin'` e `!is_current_user`.
- **Interfaccia:**
  - voce "Modifica" nel menu della riga, con un dialog su nome, cognome ed email;
  - per chi non è invitato l'email è in sola lettura, con la spiegazione;
  - stesse protezioni dei dialog esistenti: anti doppio invio, 422, 429, focus di ritorno.

### 7.4 Colori
- **Voce attiva del menu:** usa il colore primario del tema (teal), con sfondo tinta primaria, testo e barra laterale
  primari.
- **Badge di stato con colore di significato:**
  - Attivo: verde/teal;
  - Invitato: ambra;
  - Disattivato: grigio.
  - I colori sono token CSS per il chiaro e lo scuro, sempre con il testo.
- Contrasto AA verificato per tutti questi elementi in tutti e due i temi.

### 7.5 Decisioni dalle review
- **Due inviti con la stessa email in contemporanea:** 422 su `email`, non 500 (anche per l'invito admin e la
  modifica).
- **Admin solo invitato:**
  - non si "revoca": si annulla l'invito;
  - la revoca risponde 409 se l'admin non è attivo;
  - l'interfaccia mostra solo Reinvia, Modifica e Annulla.
- **Admin declassato mentre agisce su un altro admin:** riceve 403, come il responsabile.
