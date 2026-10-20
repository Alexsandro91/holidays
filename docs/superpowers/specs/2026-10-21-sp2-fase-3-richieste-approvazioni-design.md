# Sotto-progetto 2, fase 3: richieste, approvazioni e calendario

Data: 21/10/2026. Il design è stato discusso in chat con l'utente, con una bozza del calendario nel browser. Le scelte
prese da me e non dall'utente sono elencate in §11 e segnate con *(scelta mia)* nel testo.

Terza fase del sotto-progetto 2. Unisce le fasi 3 (richieste e approvazioni) e 4 (calendario del team) previste dalla
spec di fase 1, perché il calendario è il punto in cui si chiede e si approva. Si appoggia su:
- fase 1 (`2026-10-15-sp2-fase-1-sedi-calendario-design.md`): sedi, orari, `WorkCalendar`, chiusure, scope
  `User::visibleTo`, regola sul cambio sede;
- fase 2 (`2026-10-20-sp2-fase-2-tipi-assenza-saldi-design.md`): tipi di assenza, saldi come somma dei movimenti,
  movimento `usage` riservato a questa fase.

Dove divergono, vale questa.

**Due tappe**, ognuna con il suo piano e il suo branch, nell'ordine:
- **Tappa 1, richieste e approvazioni** (§3–§7): usabile da sola.
- **Tappa 2, team, chiusure e ricalcoli** (§8–§9).

## 1. Decisioni dell'utente

- **Home e Ferie e permessi.** La pagina dei propri saldi (oggi `/leave`) diventa la **Home**, come dashboard. La
  sezione **Ferie e permessi** diventa il calendario dove si chiede e si approva.
- **Richiesta:** la persona seleziona i giorni sul calendario, sceglie il tipo e invia. Chiede solo per sé.
- **Colori per stato** (in attesa, approvata, non approvata); si vede **chi** ha approvato o rifiutato.
- **Unità:** giornate intere, mezze giornate, ore (ROL, visite…). **Minimo 30 minuti**, mai meno.
- **Saldo o limite superato:** solo un avviso, per chi chiede e per chi approva; si può approvare lo stesso.
- **Annullamento** di una richiesta approvata: si può, ma **va approvato** anche l'annullamento.
- **Email** al responsabile e al dipendente.
- **Chi approva:**
  - le richieste di un dipendente: un responsabile della sua sede o un admin;
  - le richieste di un responsabile: lui stesso, un altro responsabile della sua sede o un admin;
  - sede senza responsabili: l'admin (fase 1).
- **Malattia e infortunio non si chiedono qui.**
- **Niente assenze nel passato.**
- **Calendario del team:** una riga per persona e i giorni in colonna (opzione A della bozza).
  - Responsabile e admin vedono il tipo di assenza.
  - I dipendenti vedono solo che il collega è **assente** (dati sulla salute: GDPR).
  - La vista per i dipendenti si accende con un **interruttore** dell'admin.
- **Chiusure aziendali = ferie collettive:** scalano dalle ferie.
- **Ricalcolo:** se cambia l'orario (per esempio passaggio a part-time), le ore delle richieste future si ricalcolano.
- **Due tappe** come sopra.

### 1.1 Fuori ambito
- Assenze inserite da altri per conto della persona; assenze nel passato.
- Malattia, infortunio e la gestione dei certificati.
- Modifica di una richiesta: si annulla e se ne fa una nuova.
- Allegati alle richieste.
- Notifiche push o in app, oltre al contatore "Da approvare".
- Esportazioni e report.

## 2. Concetti

- **Richiesta** (`leave_requests`): una persona, un tipo, un intervallo di date e un'unità. Ha uno stato e, una volta
  calcolata, i giorni con i minuti di ciascuno (`leave_request_days`).
- **Minuti di un giorno:** quelli dell'orario della persona in quel giorno secondo `WorkCalendar` (0 nei giorni di
  riposo, festivi, patrono e chiusure).
- **Saldo usato:** una richiesta approvata di un tipo con saldo (ferie, ROL, ex festività) scrive movimenti `usage`
  negativi; un annullamento o un ricalcolo li compensano con altri movimenti `usage`. I movimenti restano immutabili
  (fase 2).

## 3. Tappa 1 — Dati

### 3.1 `leave_requests`
| Colonna | Tipo | Note |
| --- | --- | --- |
| `id` | bigint | |
| `user_id` | FK, `cascadeOnDelete` | chi chiede |
| `absence_type_id` | FK, `restrictOnDelete` | |
| `location_id` | FK | sede della persona al momento della richiesta (snapshot, fase 1 §1.2) |
| `unit` | string | `days`, `half_day`, `hours` |
| `starts_on`, `ends_on` | date | uguali per `half_day` e `hours` |
| `half` | string, null | `morning` o `afternoon`, solo per `half_day` |
| `starts_at`, `ends_at` | time, null | solo per `hours`, multipli di 30 minuti |
| `minutes` | int unsigned | totale dei minuti dei giorni |
| `working_days` | decimal(5,2) | giorni contati: 1 per giornata, 0,5 per mezza giornata, minuti ÷ minuti del giorno per le ore (es. 4 h su 8 = 0,5) *(scelta mia)*; per i tipi a giorni di calendario, i giorni di calendario |
| `status` | string | enum `LeaveRequestStatus` (§4) |
| `note` | string(500), null | di chi chiede |
| `decision_note` | string(500), null | motivo del rifiuto, facoltativo |
| `decided_by`, `decided_at` | FK null `nullOnDelete`, timestamp null | chi ha approvato o rifiutato |
| `cancellation_requested_at` | timestamp, null | |
| `cancelled_by`, `cancelled_at` | FK null, timestamp null | chi ha approvato l'annullamento o annullato direttamente |
| `source` | string | `request`; `closure` nella tappa 2 |
| `closure_id` | FK null `nullOnDelete` | solo tappa 2; la richiesta resta anche se la chiusura viene cancellata |
| timestamps | | |

Indici: (`user_id`, `starts_on`), (`status`, `location_id`).

### 3.2 `leave_request_days`
| Colonna | Tipo | Note |
| --- | --- | --- |
| `leave_request_id` | FK `cascadeOnDelete` | |
| `date` | date | |
| `minutes` | int unsigned | minuti scalati quel giorno |

Unico (`leave_request_id`, `date`); indice su `date` per il calendario del team.

Per `days` contiene tutti i giorni dell'intervallo, anche quelli a 0 minuti (servono al calendario). Per `half_day` e
`hours` un solo giorno.

### 3.3 `balance_movements`
- Nuova colonna `leave_request_id` (FK null, `nullOnDelete`).
- **Un movimento `usage` per richiesta e per mese di calendario** *(scelta mia)*. `effective_on` = primo giorno di
  assenza di quel mese; `minutes` = −(somma dei minuti dei giorni di quel mese).
  - Così l'usato cade nell'anno e nel mese giusti (riepilogo della fase 2 e allineamento alla busta paga) senza una riga
    per giorno.
  - Una richiesta 28/09–02/10 scrive due movimenti.
- **Annullamento:** movimenti `usage` positivi con le stesse chiavi (richiesta, mese).
- **Ricalcolo** (tappa 2): movimenti `usage` per la differenza.
- **Usato prima dell'ultimo allineamento** *(scelta mia)*: può succedere solo se si approva in ritardo una richiesta
  già iniziata. È ammesso; la regola "mai prima dell'ultimo allineamento" della fase 2 vale solo per gli allineamenti.

### 3.4 Tipi di assenza
- La migration archivia `sickness` e `injury` (valori letterali). L'admin può ripristinarli, ma l'interfaccia di
  questa fase non li usa.
- Un tipo si può chiedere se: attivo, vale per il tipo di rapporto della persona e, quando richiede l'abilitazione, la
  persona è abilitata (fase 2 §3.4).
- `requires_approval = false` *(scelta mia)*: la richiesta nasce già approvata, con `decided_by = null`, e al
  responsabile arriva solo l'avviso. Nei tipi di partenza nessun tipo richiedibile è senza approvazione, ma l'admin può
  crearne. L'annullamento segue comunque il percorso normale: va approvato.
- Il form offre i tipi richiedibili e basta *(scelta mia)*: se l'admin ripristina malattia o infortunio, tornano
  richiedibili come gli altri (è una sua scelta esplicita). Il numero di protocollo del certificato resta fuori ambito.

## 4. Tappa 1 — Stati

Enum `LeaveRequestStatus`:

| Stato | Significato | Saldo |
| --- | --- | --- |
| `pending` | in attesa | non scalato |
| `approved` | approvata | scalato |
| `rejected` | non approvata | non scalato |
| `withdrawn` | ritirata da chi l'ha chiesta mentre era in attesa | non scalato |
| `cancellation_requested` | approvata, con annullamento chiesto | ancora scalato |
| `cancelled` | annullata | restituito |

**Transizioni:**
- `pending` → `approved` | `rejected` (approvatore) | `withdrawn` (chi l'ha chiesta).
- `approved` → `cancellation_requested`: lo chiede chi l'ha chiesta, solo **prima che inizi**.
- `approved` → `cancelled`: annullamento diretto di un approvatore, solo prima che inizi *(scelta mia)*.
- `cancellation_requested` → `cancelled` (annullamento approvato) | `approved` (annullamento rifiutato).
- "Prima che inizi" = `starts_on` dopo oggi; per una richiesta a ore di oggi, prima di `starts_at`. "Oggi" e l'ora
  sono sempre nel fuso della sede.

**Concorrenza:** ogni transizione blocca la riga della richiesta (e quella dell'utente quando scrive movimenti) e
ricontrolla lo stato. Uno stato cambiato nel frattempo dà 409 `leave.state_changed`.

**Approvazione di una richiesta già iniziata:** ammessa, perché l'approvatore può essere in ritardo. Il ritiro di una
richiesta in attesa è ammesso in qualunque momento.

**Disattivazione** *(scelta mia)*: quando un account viene disattivato, nella stessa transazione le sue richieste
future passano: `pending` → `withdrawn`, `approved` e `cancellation_requested` → `cancelled` con il saldo restituito per
i giorni da domani (`cancelled_by` = chi disattiva), senza email. Così non restano richieste di chi non c'è più in "Da
approvare". Le richieste già iniziate restano come sono.

**Cambio del tipo di rapporto** *(scelta mia)*: le richieste restano come sono; se servisse, un approvatore le annulla
direttamente. Una nuova richiesta si valida sempre con il tipo di rapporto attuale.

## 5. Tappa 1 — Regole della richiesta

### 5.1 Validazione (422 sul campo)
- **Date:** `starts_on` ≥ oggi; `ends_on` ≥ `starts_on`; intervallo al massimo 366 giorni (limite di `WorkCalendar`).
- **Unità permessa dal tipo** (`allows_days`, `allows_half_days`, `allows_hours`).
- **`half_day`:** un solo giorno lavorativo; `half` obbligatorio. Minuti = metà dei minuti del giorno, arrotondati al
  minuto.
- **`hours`:**
  - un solo giorno lavorativo;
  - `starts_at` < `ends_at`, entrambi a multipli di 30 minuti, durata ≥ 30 minuti e ≤ minuti del giorno;
  - per oggi, `starts_at` dopo l'ora attuale.
  - L'orario della sede non ha fasce orarie, quindi `starts_at` e `ends_at` non si confrontano con un turno.
- **`days`:** almeno un giorno con minuti > 0 per i tipi a giorni lavorativi; ogni giorno lavorativo vale i suoi
  minuti.
  - Per i tipi `day_count = calendar` (congedo matrimoniale, maternità…) `working_days` conta i giorni di calendario e
    i minuti restano quelli dell'orario. Questi tipi non hanno saldo.
- **Tipo richiedibile** (§3.4); altrimenti 422 su `absence_type_id`.
- **Sovrapposizione** con un'altra richiesta della stessa persona in stato `pending`, `approved` o
  `cancellation_requested` → 422 `leave.overlap`. Contano solo i giorni con minuti > 0 (e, per i tipi a giorni di
  calendario, tutti i giorni) *(scelta mia)*: un intervallo di ferie che attraversa una chiusura non si scontra con le
  ferie collettive di quei giorni. Due mezze giornate opposte (mattina e pomeriggio) nello stesso giorno
  sono ammesse, così come due fasce orarie che non si toccano. Una giornata intera esclude tutto il resto in quel
  giorno.
- **Nota:** al massimo 500 caratteri.

### 5.2 Avvisi (mai bloccanti)
Calcolati dall'anteprima e dalla creazione, e mostrati anche all'approvatore:
- **Saldo insufficiente:** per i tipi con saldo, quando `disponibile − minuti della richiesta < 0`. *(scelta mia)*
  `disponibile` = saldo a oggi − usato approvato con data futura − richieste in attesa dello stesso saldo (esclusa
  quella in esame). Le maturazioni future non si contano.
- **Limite del tipo superato** (fase 2 §3.1: `limit_amount`, `limit_unit`, `limit_period`): somma di approvate e in
  attesa dello stesso tipo nel mese o nell'anno dei giorni, oppure nella richiesta stessa per `request`. In giorni o in
  ore secondo `limit_unit`. Un limite in giorni conta le richieste a ore per frazione di giorno (`working_days`): 4 ore
  di legge 104 su un giorno da 8 valgono 0,5 giorni *(scelta mia)*.

Codici: `balance_insufficient` (con il saldo dopo la richiesta), `limit_exceeded` (con limite e totale).

### 5.3 Effetti sul saldo
- **Approvazione** (o creazione già approvata): movimenti `usage` per mese (§3.3), sotto lock dell'utente, dentro la
  stessa transazione del cambio di stato.
- **Annullamento approvato o diretto:** movimenti `usage` positivi per gli stessi mesi.
- **Tipi senza saldo:** nessun movimento.

## 6. Tappa 1 — API

Tutte sotto `auth:sanctum`, FormRequest, Resource, policy. Scope e 404 come la fase 1 per le richieste di persone non
visibili.

| Metodo e rotta | Chi | Cosa fa |
| --- | --- | --- |
| `GET /api/profile/calendar?from=&to=` | chiunque | giorni dell'intervallo (max 366) con minuti e motivi non lavorativi (`WorkCalendar::forUser`) e le proprie richieste che lo toccano, esclusi `withdrawn` |
| `GET /api/leave-requests?year=` | chiunque | le proprie richieste, dalla più recente, paginate 20, tutte gli stati |
| `POST /api/leave-requests/preview` | chiunque | stessi campi della creazione → giorni con minuti, `minutes`, `working_days`, saldo (attuale, disponibile, dopo) se il tipo ha saldo, avvisi |
| `POST /api/leave-requests` | chiunque | crea per sé; 201 con la richiesta e gli avvisi |
| `GET /api/leave-requests/{request}` | chi l'ha chiesta, approvatori | dettaglio con giorni, stato, chi ha deciso e quando, note |
| `POST /api/leave-requests/{request}/withdraw` | chi l'ha chiesta | `pending` → `withdrawn` |
| `POST /api/leave-requests/{request}/cancellation` | chi l'ha chiesta | `approved` → `cancellation_requested` |
| `GET /api/approvals?filter[location]=` | responsabile, admin | richieste `pending` e `cancellation_requested` che l'attore può decidere, dalla più vecchia, con avvisi aggiornati; `filter[location]` solo admin |
| `POST /api/leave-requests/{request}/approve` | approvatori | `pending` → `approved` |
| `POST /api/leave-requests/{request}/reject` | approvatori | `pending` → `rejected`, `decision_note` facoltativo |
| `POST /api/leave-requests/{request}/cancellation/approve` | approvatori | → `cancelled` |
| `POST /api/leave-requests/{request}/cancellation/reject` | approvatori | → `approved` |
| `POST /api/leave-requests/{request}/cancel` | approvatori | `approved` → `cancelled`, annullamento diretto |

- **Approvatori** (`LeaveRequestPolicy::decide`, senza query):
  - un admin, su chiunque;
  - un responsabile, sulle richieste di persone non admin della sua sede (`user.location_id`), comprese le proprie.
  - *(scelta mia)* Le richieste di un admin le decide un admin, anche lui stesso.
- **Contatore:** `GET /api/auth/user` aggiunge `meta.pending_approvals` (numero) per responsabili e admin; una query di
  conteggio.
- **`GET /api/profile/absence-types`** (fase 2) aggiunge a ogni tipo `allows_days`, `allows_half_days`,
  `allows_hours`, `balance`, `day_count`, `limit`, così il form sa cosa offrire.
- **`BalanceMovementResource`** aggiunge `leave_request: {id, absence_type_name, starts_on, ends_on} | null` per i
  movimenti `usage`.
- **Riepilogo dei saldi** (fase 2 §5.3) aggiunge per ogni saldo:
  - `planned_minutes`: usato approvato con data futura;
  - `pending_minutes`: richieste in attesa;
  - `available_minutes`: definizione di §5.2.

## 7. Tappa 1 — Interfaccia e email

### 7.1 Home (`/`)
- Prende il contenuto di oggi di `/leave`: i miei saldi con anno e movimenti, e i tipi utilizzabili.
- In più:
  - **Prossime assenze**: le mie richieste future in attesa, approvate o con annullamento richiesto, al massimo 5, con
    un link al calendario;
  - per responsabili e admin, un riquadro **"N richieste da approvare"** che porta alla scheda Da approvare.
- La rotta `/leave` resta, ma mostra il calendario (§7.2).

### 7.2 Ferie e permessi (`/leave`)
Schede:
- **Il mio calendario.** Vista mensile, con mese precedente e successivo.
  - Riposi, festivi, patrono e chiusure sono in grigio con il motivo.
  - Le richieste sono colorate per stato: in attesa giallo, approvata verde, non approvata rosso, annullamento
    richiesto a righe. *(scelta mia)* Le ritirate e le annullate non compaiono sul calendario.
  - Selezionando un giorno o un intervallo (clic sul primo e sull'ultimo, oppure con la tastiera) si apre **Nuova
    richiesta**: tipo, unità (giornate intere / mezza giornata mattina o pomeriggio / ore dalle–alle), nota.
  - L'anteprima mostra ore e giorni scalati, il saldo dopo e gli avvisi.
  - Cliccando una richiesta si apre il dettaglio: stato, chi ha deciso e quando, note, giorni, e le azioni ritira o
    chiedi annullamento.
  - Sotto il calendario c'è l'elenco **Le mie richieste** dell'anno.
  - Anche da tastiera: frecce sui giorni, Invio per selezionare, alternativa con due campi data.
- **Da approvare** (responsabili e admin; contatore anche sulla voce del menu):
  - elenco delle richieste e degli annullamenti in attesa, con persona, tipo, date, ore, avvisi, nota;
  - azioni Approva, Rifiuta con motivo facoltativo, Approva annullamento, Rifiuta annullamento;
  - l'admin ha il filtro per sede;
  - dal dettaglio di una richiesta approvata, l'approvatore può Annullare direttamente.
    *(scelta mia)* Nella tappa 1 l'azione si raggiunge solo quando il dettaglio si apre da un elenco che contiene
    richieste approvate di altri: Da approvare mostra solo le richieste in attesa e gli annullamenti chiesti, quindi
    l'ingresso arriva con il calendario del team della tappa 2 (§8.2). Rotta, permesso `can.cancel` e azione nel
    dettaglio esistono già.
- **Team:** tappa 2.

### 7.3 Scheda saldi (fase 2)
- I riquadri aggiungono **Pianificate**, **In attesa** e **Disponibili**.
- I movimenti `usage` si descrivono come "Ferie 10–14 agosto" (tipo e date dalla richiesta) e "Annullate: Ferie
  10–14 agosto".

### 7.4 Email
Tutte in coda, dopo il commit, nella lingua del destinatario.

| Evento | A chi |
| --- | --- |
| nuova richiesta in attesa, annullamento chiesto | tutti i responsabili attivi della sede della persona escluso lei; se non ce ne sono, tutti gli admin attivi escluso lei *(scelta mia)* |
| richiesta di un responsabile | gli altri responsabili della sede e, se non ce ne sono, gli admin |
| richiesta di un admin | gli altri admin |
| nuova richiesta nata già approvata (tipo senza approvazione) | come una nuova richiesta, come avviso |
| approvata, rifiutata, annullamento approvato o rifiutato, annullata direttamente | la persona, con chi ha deciso e il motivo; non quando decide lei stessa |

Il ritiro di una richiesta in attesa non manda email *(scelta mia)*.

## 8. Tappa 2 — Calendario del team e interruttore

### 8.1 Interruttore
- Nuova impostazione dell'azienda `team_calendar_for_employees` (bool, default `false` *(scelta mia)*), in una tabella
  `company_settings` a riga unica creata dalla migration.
- Si gestisce in Impostazioni con l'interruttore "I dipendenti vedono il calendario del team".

### 8.2 Vista
- Scheda **Team** in Ferie e permessi: una riga per persona, i giorni in colonna, scorrevole per settimana e mese, con
  un massimo di 62 giorni per richiesta API.
- Weekend, festivi e chiusure sono evidenziati in colonna.
- Ogni cella mostra l'assenza con il colore dello stato.

**Chi vede cosa:**

| | Persone | Contenuto delle celle |
| --- | --- | --- |
| Admin | tutte, filtro per sede | tipo, stato, ore; clic → dettaglio con le azioni |
| Responsabile | la sua sede | tipo, stato, ore; per gli admin della sede solo "Assente" *(scelta mia)* |
| Dipendente, con l'interruttore acceso | la sua sede, sé compreso | "Assente" o "Assente (da confermare)"; il proprio tipo solo nella propria riga |
| Dipendente, interruttore spento | — | la scheda non c'è; l'API risponde 403 |

- Per i colleghi le richieste rifiutate, ritirate e annullate non compaiono. *(scelta mia)* Una richiesta con
  annullamento richiesto compare come assente confermata.
- **API:** `GET /api/team-calendar?from=&to=&filter[location]=` → persone (attive, della sede o di tutte per l'admin,
  ordinate per cognome) con i loro giorni di assenza. Il contenuto dipende dal ruolo come sopra: il tipo non esce mai
  dal server verso chi non può vederlo. Numero di query costante.

## 9. Tappa 2 — Chiusure come ferie collettive e ricalcoli

### 9.1 Chiusure
- Nuova colonna `closures.deducts_vacation` (bool, default `true`). Nel form: "Scala dalle ferie", attivo di default.
  Spenta, la chiusura è pagata dall'azienda e resta solo un giorno non lavorativo.
- **Se scala:** per ogni persona `employee` con account attivo della sede (o di tutte le sedi) l'app crea una richiesta
  `source = closure`, tipo `vacation`, unità `days`, già `approved`, con `decided_by` = chi ha creato la chiusura.
  - I giorni sono quelli lavorativi per la persona nell'intervallo; i minuti sono quelli del suo orario.
  - Scrive i movimenti `usage`. Il saldo può andare sotto zero (ferie anticipate).
- **Solo giorni futuri** *(scelta mia)*: le ferie collettive si creano, si tolgono e si ricalcolano solo per i giorni
  da domani in poi, come ogni altra richiesta (niente assenze nel passato). Una chiusura creata o modificata nel
  passato resta un giorno non lavorativo e basta; i giorni passati di una chiusura cancellata o accorciata restano
  scalati. Così nessuna scrittura cade prima dell'ultimo allineamento alla busta paga.
- **Assenze già presenti** *(scelta mia)*: un giorno in cui la persona ha già un'altra assenza in attesa o approvata
  (maternità, legge 104, congedo, ferie personali…) non scala ferie collettive: l'assenza personale prevale. Se quella
  assenza viene poi ritirata o annullata, il ricalcolo aggiunge il giorno alle ferie collettive.
- **Cosa si può fare su una richiesta di chiusura** *(scelta mia)*: la persona non la ritira né ne chiede
  l'annullamento, e l'approvatore non la annulla direttamente; cambia solo modificando o cancellando la chiusura. Non
  compare in "Da approvare" né nel contatore; compare nel calendario, nelle Prossime assenze della Home e nel
  calendario del team.
- **Collaboratori e stagisti:** nessuna richiesta; per loro i giorni di chiusura restano non lavorativi.
- `WorkCalendar` continua a segnare i giorni di chiusura come non lavorativi per le richieste personali, così una
  richiesta personale non li conta mai due volte.
- **Modifica della chiusura:** le richieste collegate si ricalcolano (§9.2); persone o giorni in più ricevono nuove
  richieste, quelli tolti vengono annullati.
- **Cancellazione:** le richieste collegate diventano `cancelled` e il saldo viene restituito.
- Nessuna email per le ferie collettive *(scelta mia)*. Compaiono nel calendario e nei movimenti come "Chiusura:
  <descrizione>".
- **Chiusure già esistenti** al rilascio: un comando `leave:sync-closures` crea le richieste solo per i giorni da domani
  in poi *(scelta mia)*; il deploy lo lancia una volta.
- **Nuovi dipendenti:** chi diventa dipendente attivo dopo la creazione della chiusura riceve le sue ferie collettive
  dal ricalcolo del giorno dopo (§9.2, job notturno).

### 9.2 Ricalcolo
- **Quando:**
  - cambia l'orario di una persona o di una sede;
  - cambia il patrono;
  - una chiusura viene creata, modificata o cancellata;
  - cambia la sede di una persona (§9.3).
  - Inoltre un job notturno `leave:recalculate` ripassa le richieste future per recuperare ciò che non è partito
    all'evento.
- **Cosa:**
  - le richieste `pending`, `approved` e `cancellation_requested` con giorni da domani in poi *(scelta mia: oggi e i
    giorni passati restano come sono)*;
  - si ricalcolano i minuti dei giorni futuri con `WorkCalendar`;
  - per le approvate si scrivono movimenti `usage` per la differenza, per mese;
  - se una richiesta resta senza giorni lavorativi viene `cancelled` dal sistema (`cancelled_by = null`).
- **Email** alla persona quando i minuti di una sua richiesta cambiano, con prima e dopo.
- Il ricalcolo gira in coda dopo il commit dell'evento che lo scatena. Ogni richiesta si aggiorna sotto lock e la
  ripetizione è idempotente.

### 9.3 Cambio sede (decisione di fase 1)
- **Le richieste future** (che iniziano da domani) di chi cambia sede:
  - si ricalcolano con il calendario della nuova sede;
  - aggiornano `location_id`;
  - se approvate tornano `pending`, restituendo il saldo;
  - la richiesta passa al responsabile della nuova sede.
- **Le richieste già iniziate** restano nello stato in cui sono e si ricalcolano solo nei giorni futuri *(scelta mia)*.
- **Email:** una sola alla persona con l'elenco delle richieste rimesse in attesa; ai responsabili della nuova sede le
  email di nuova richiesta.

## 10. Test

### 10.1 Tappa 1
- **Backend:**
  - **validazione:** ogni regola di §5.1;
  - **calcolo dei minuti:** giornata, mezza, ore, giorni di calendario, festivi e patrono esclusi, part-time;
  - **avvisi** di saldo e di limite, per periodo;
  - **stati:**
    - ogni transizione permessa e ogni transizione vietata;
    - "prima che inizi" anche per un'assenza a ore di oggi;
  - **saldo:**
    - movimenti `usage` per mese, anche a cavallo di mesi e di anni;
    - annullamento che restituisce il saldo;
    - riepilogo, pianificate, in attesa e disponibili;
  - **matrice dei permessi:**
    - il dipendente sulle richieste altrui (404 o 403);
    - il responsabile su altre sedi (404) e sugli admin;
    - l'auto-approvazione del responsabile;
    - l'admin su sé stesso;
  - **concorrenza:** doppia decisione → 409;
  - **email:** destinatari per ogni evento e sede senza responsabili;
  - **contatore** in `/api/auth/user`; **migration** che archivia malattia e infortunio.
- **Frontend:**
  - calendario: stati, colori, giorni non lavorativi, selezione con mouse e tastiera;
  - form con anteprima e avvisi; dettaglio con le azioni;
  - Da approvare; Home con saldi, prossime assenze e riquadro da approvare;
  - scheda saldi con pianificate e disponibili; descrizione dei movimenti `usage`.
- **E2E:**
  - un dipendente chiede 2 giorni di ferie, il responsabile li approva e il saldo pianificato scende;
  - il dipendente chiede l'annullamento, il responsabile lo approva e il saldo torna;
  - il responsabile chiede un ROL a ore e se lo approva da solo;
  - un rifiuto con motivo arriva per email (Mailpit).

### 10.2 Tappa 2
- **Backend:**
  - calendario del team per ruolo e interruttore: il tipo non esce mai verso i dipendenti né verso il responsabile per
    gli admin;
  - ferie collettive: creazione, modifica, cancellazione, collaboratori esclusi, saldo negativo;
  - ricalcolo: orario personale, orario della sede, patrono, chiusura, idempotenza, solo giorni futuri, richiesta
    rimasta senza giorni;
  - cambio sede con richieste future e già iniziate;
  - `leave:sync-closures`; query costanti.
- **Frontend:** vista a righe, celle per ruolo, interruttore in Impostazioni, opzione "Scala dalle ferie".
- **E2E:**
  - l'admin crea una chiusura e il dipendente vede le ferie collettive e il saldo sceso;
  - con l'interruttore acceso un dipendente vede "Assente" sul collega e non il tipo.

## 11. Scelte mie (da verificare leggendo)
1. Un movimento `usage` per richiesta e per mese, con data = primo giorno di assenza del mese (§3.3).
2. Usato con data precedente all'ultimo allineamento ammesso (§3.3).
3. Tipi senza approvazione: la richiesta nasce approvata e il responsabile riceve solo l'avviso (§3.4).
4. Annullamento diretto da parte di un approvatore, solo prima che inizi (§4).
5. Ritirate e annullate non compaiono sul calendario (§7.2).
6. Mezza giornata = metà dei minuti del giorno, con mattina o pomeriggio solo come etichetta; orari a passi di 30
   minuti, senza confronto con un turno (§5.1).
7. Due mezze giornate opposte o fasce orarie separate nello stesso giorno sono ammesse (§5.1).
8. Disponibile = saldo a oggi − pianificato − in attesa, senza contare le maturazioni future (§5.2).
9. Le richieste di un admin le decide un admin, anche lui stesso (§6).
10. Email ai responsabili della sede, e agli admin solo se la sede non ha responsabili; nessuna email per i ritiri
    (§7.4).
11. Interruttore del team spento di default, in una tabella `company_settings` (§8.1).
12. Nel calendario del team il responsabile vede gli admin della sua sede solo come "Assente"; l'annullamento richiesto
    compare ai colleghi come assenza confermata (§8.2).
13. Ferie collettive senza email; `leave:sync-closures` solo per i giorni futuri al rilascio (§9.1).
14. Il ricalcolo tocca solo i giorni da domani; job notturno di recupero (§9.2).
15. Cambio sede: le richieste già iniziate restano nel loro stato (§9.3).
16. Ore contate come frazione di giorno (`working_days`) per i limiti in giorni, es. 4 h di 104 = 0,5 giorni (§3.1,
    §5.2).
17. Disattivazione: richieste future ritirate o annullate con saldo restituito; cambio del tipo di rapporto senza
    effetti sulle richieste (§4).
18. Tipi richiedibili = attivi, applicabili e abilitati; malattia e infortunio esclusi solo perché archiviati;
    annullamento sempre da approvare, anche per i tipi senza approvazione (§3.4).
19. Sovrapposizioni contate solo sui giorni con minuti (§5.1).
20. Ferie collettive solo sui giorni futuri; l'assenza personale prevale sulla chiusura; richieste di chiusura non
    ritirabili né annullabili a mano e fuori da "Da approvare" (§9.1).
21. Annullamento diretto dell'approvatore senza un punto d'ingresso nell'interfaccia della tappa 1: arriva con il
    calendario del team della tappa 2, che apre il dettaglio di ogni richiesta approvata con le sue azioni (§7.2,
    §8.2).
