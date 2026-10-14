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
