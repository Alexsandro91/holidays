# Sotto-progetto 2, fase 1: sedi e calendario lavorativo

Data: 15/10/2026. Il design è stato approvato in chat dall'utente, una sezione alla volta.

Questa è la prima fase del sotto-progetto 2 (gestione ferie e permessi). Introduce le sedi e il calendario lavorativo su
cui si appoggeranno saldi, richieste, approvazioni e calendario del team. Completa la spec principale
(`2026-09-30-fondamenta-autenticazione-design.md`, §1) e la spec di gestione utenti
(`2026-10-14-utenti-tabella-permessi-design.md`). Dove divergono, vale questa.

**Differenza dalla spec principale:** là le sedi erano facoltative e nessun campo sede era obbligatorio. Ora ogni
persona ha una sede: esiste sempre una sede principale, e un'azienda con una sola sede non vede nulla di diverso da oggi
(§5.5).

## 1. Decisioni dell'utente
- **Perché le sedi:** festivi locali (patrono), giorni e orari di lavoro diversi, responsabili che approvano solo per la
  propria sede, calendario del team visibile solo per sede. L'admin vede tutto e filtra per sede.
- **Sede principale:** ogni dipendente e responsabile ci viene associato di default; solo l'admin cambia la sede di una
  persona.
- **Responsabili:** ogni persona appartiene a una sola sede. Una sede può avere più responsabili, che si coprono a
  vicenda. Un responsabile gestisce solo la propria sede.
- **Paese:** oggi tutte le sedi sono in Italia. La sede ha già paese e fuso orario, così l'estero si aggiunge senza
  rifare il modello.
- **Orario di lavoro:** ogni sede ha un orario standard; l'admin può dare a una persona un orario suo (es. part-time).
  Senza orario personale vale quello della sede.
- **Cambio sede e richieste** (si implementa nella fase 3, quando le richieste esistono): lo storico prima della data
  del cambio resta com'era; le richieste dopo quella data si ricalcolano con il calendario della nuova sede e tornano
  in attesa del nuovo responsabile. Il dipendente riceve un'email con l'elenco e non deve rifare nulla.
- **Sezione Sedi:** solo admin.

### 1.1 Fasi del sotto-progetto 2
1. **Sedi e calendario lavorativo:** questa spec.
2. **Tipi di assenza e saldi:** ferie, permessi, ex festività, maturazione.
3. **Richieste e approvazioni:** approvazione del responsabile della sede, notifiche, cambio sede con richieste aperte
   (decisione sopra).
4. **Calendario del team** per sede.

### 1.2 Fuori ambito
- Sedi all'estero (solo il campo paese, con il solo valore `IT`).
- Storico delle sedi di una persona: le richieste (fase 3) salveranno sede, giorni e ore calcolati, quindi non serve.
- Cambio sede con decorrenza futura o passata: il cambio vale da subito.
- Ricalcolo delle richieste quando cambiano festivi, chiusure od orari: lo decide la fase 3.
- Approvazioni in una sede senza responsabili: nella fase 3 passano all'admin.

## 2. Modello dati

### 2.1 `locations`
| Colonna | Tipo | Note |
| --- | --- | --- |
| `id` | bigint | |
| `name` | string(100) | unico (collation case-insensitive), sedi archiviate comprese |
| `city` | string(100), null | |
| `country` | char(2) | oggi solo `IT` |
| `timezone` | string(64) | oggi solo `Europe/Rome` |
| `patron_day`, `patron_month` | tinyint, null | entrambi o nessuno; data valida in un anno non bisestile (niente 29/02) |
| `primary_marker` | tinyint, null, unico | `1` per la principale, `NULL` per le altre: il DB garantisce che ce ne sia al massimo una |
| `archived_at` | timestamp, null | |
| timestamps | | |

- **Sempre una e una sola principale:** l'indice unico impedisce la seconda; il servizio che cambia la principale
  blocca le righe coinvolte (`lockForUpdate`) e sposta il marcatore in una transazione.
- **La principale non si archivia mai.** Una sede archiviata non può diventare principale.

### 2.2 `users.location_id`
- Obbligatorio, foreign key con `restrictOnDelete` (le sedi non si cancellano, si archiviano).
- Vale per ogni ruolo e stato: admin, invitati e disattivati compresi.
- Indice su `location_id`.

### 2.3 `work_schedules`
| Colonna | Tipo | Note |
| --- | --- | --- |
| `id` | bigint | |
| `location_id` | FK, null | orario standard della sede |
| `user_id` | FK, null | orario personale |
| `valid_from` | date | |
| `follows_location` | bool | solo per le righe di una persona: da quella data torna a valere l'orario della sede |
| `monday_minutes` … `sunday_minutes` | smallint unsigned | `0` = giorno non lavorativo; multipli di 15, da 0 a 720 |
| timestamps | | |

- Esattamente uno tra `location_id` e `user_id`, garantito dal servizio e coperto da test. Le righe di una sede hanno
  sempre `follows_location = false`.
- Unico su (`location_id`, `valid_from`) e su (`user_id`, `valid_from`).
- Una riga con `follows_location = true` ha i minuti a 0 e non viene letta per i minuti.
- **Versioni:** una nuova versione vale da `valid_from` in poi. `valid_from` è oggi o una data futura, calcolata nel fuso
  della sede, mai nel passato. Le versioni già iniziate non si modificano né si cancellano; quelle future si cancellano.
- Almeno un giorno lavorativo per ogni versione che non sia `follows_location`.

### 2.4 `closures`
| Colonna | Tipo | Note |
| --- | --- | --- |
| `id` | bigint | |
| `location_id` | FK, null | `NULL` = tutte le sedi |
| `starts_on`, `ends_on` | date | `ends_on >= starts_on`, al massimo 31 giorni |
| `description` | string(100) | |
| timestamps | | |

- Le chiusure possono sovrapporsi ad altre chiusure o a festivi: il giorno è comunque non lavorativo, con tutte le
  etichette.
- Si creano, modificano e cancellano a qualunque data.

### 2.5 Festivi nazionali
Non stanno in tabella. Un calcolatore per paese (`HolidayCalendar`, oggi solo l'implementazione italiana) restituisce i
festivi di un anno, con nome tradotto:
- 1/1 Capodanno, 6/1 Epifania, Pasqua, Lunedì dell'Angelo, 25/4 Liberazione, 1/5 Festa del lavoro, 2/6 Festa della
  Repubblica, 15/8 Ferragosto, 1/11 Ognissanti, 8/12 Immacolata, 25/12 Natale, 26/12 Santo Stefano;
- 4/10 San Francesco d'Assisi, **dal 2026**, tornato festa nazionale;
- Pasqua con l'algoritmo gregoriano (anonimo, Meeus/Jones/Butcher);
- anni supportati: 2000–2100; fuori range, 422.

### 2.6 Migrazione dei dati esistenti
Una migration crea `locations` e inserisce la "Sede principale" (`IT`, `Europe/Rome`, principale), con un orario standard
lunedì-venerdì 480 minuti valido da oggi. Poi aggiunge `users.location_id` nullable, associa tutti gli utenti alla
principale e rende la colonna obbligatoria. Valori letterali, niente Enum né servizi (regole di progetto). È l'unico
punto in cui una migration inserisce dati: serve perché ogni ambiente, produzione compresa, nasca con la principale.

`DevUserSeeder` e le factory usano la principale; la factory di `User` crea la principale se manca.

## 3. Calendario lavorativo

### 3.1 Servizio `WorkCalendar`
Un unico punto calcola i giorni lavorativi. Tutto il resto (saldi, richieste, calendario del team) passerà da qui.

- **Ingresso:** una persona, oppure una sede (per l'orario standard), e un intervallo di date, al massimo 366 giorni.
- **Uscita:** per ogni giorno, i minuti lavorativi e, se il giorno non è lavorativo, i motivi:
  - `weekly_rest` (0 minuti nell'orario);
  - `national_holiday` (con il nome);
  - `patron` (con il nome della sede);
  - `closure` (con la descrizione).
- **Regola:** un giorno è lavorativo se l'orario ha minuti > 0 e non è festivo nazionale, patrono o chiusura. I minuti
  vengono dall'orario personale valido quel giorno; se manca o è `follows_location`, dall'orario della sede valido quel
  giorno.
- **Sede della persona:** quella attuale. Per i giorni passati vale lo snapshot delle richieste (fase 3).
- **"Oggi":** sempre nel fuso della sede.
- **Query:** al massimo una per tipo (orari della sede, orari della persona, chiusure) per ogni chiamata, mai una per
  giorno.

### 3.2 Calendario dell'anno di una sede
`GET /api/locations/{location}/calendar?year=2026` (§4.2) restituisce i giorni non lavorativi della sede in quell'anno
secondo l'orario standard, ciascuno con i suoi motivi ed etichette. Le domeniche e gli altri giorni di riposo
settimanale non sono elencati uno per uno: la risposta riporta l'orario standard per ogni versione valida nell'anno.

## 4. API
Tutte sotto `auth:sanctum` con i middleware di oggi. Output sempre tramite API Resource, validazione in FormRequest.

### 4.1 Visibilità delle persone
- **Scope `User::visibleTo(User $actor)`:**
  - admin: tutti;
  - responsabile: solo `location_id = $actor->location_id`;
  - dipendente: nessuno.
- **Dove vale:** lista, conteggi e ricerca di `GET /api/users`, e la risoluzione di `{user}` in tutte le rotte
  `/api/users/{user}/…` e `PATCH /api/users/{user}`. Una persona fuori scope dà **404**, come se non esistesse.
- **Policy:** `UserPolicy` resta senza query. `mayActOn` aggiunge "stessa sede" per il responsabile, confrontando
  `location_id` già caricati: serve da seconda barriera.
- **Servizi:** `UserManagementService` ricontrolla sulle righe bloccate anche la sede. Se il destinatario o chi agisce
  ha cambiato sede nel frattempo, la risposta è 409 `users.state_changed`.
- **Rotte `/api/administrators`:** già solo admin, nessuno scope.

### 4.2 Sedi (solo admin, `LocationPolicy`)
| Metodo e rotta | Cosa fa |
| --- | --- |
| `GET /api/locations` | lista paginata; `filter[status]=active\|archived` (default `active`), `sort=name\|-name`; ogni riga ha `users_count`, `managers_count` (responsabili attivi), `is_primary`, `archived_at`; `meta.counts` per stato |
| `GET /api/locations/options` | sedi attive per le select: `id`, `name`, `is_primary`, ordinate per nome, al massimo 500 |
| `POST /api/locations` | `name`, `city`, `patron_day`, `patron_month`; copia l'orario standard della principale (valido da oggi); 201 |
| `GET /api/locations/{location}` | dettaglio con l'orario standard attuale e le versioni future |
| `PATCH /api/locations/{location}` | `name`, `city`, `patron_day`, `patron_month` (tutti `sometimes`) |
| `POST /api/locations/{location}/primary` | diventa la principale; 409 se archiviata |
| `POST /api/locations/{location}/archive` | 409 `locations.has_users` se ha persone (in qualunque stato), 409 `locations.primary` se è la principale |
| `POST /api/locations/{location}/restore` | toglie l'archiviazione |
| `GET /api/locations/{location}/schedules` | versioni dell'orario standard, dalla più recente |
| `POST /api/locations/{location}/schedules` | nuova versione: `valid_from`, `minutes` (7 valori da lunedì) |
| `DELETE /api/locations/{location}/schedules/{schedule}` | solo versioni future; 409 se già iniziata |
| `GET /api/locations/{location}/calendar?year=` | §3.2 |

- Una sede archiviata si può ancora leggere e modificare (nome, patrono, orari, chiusure), ma non si assegna a nessuno.
- `name` unico: 422 sul campo, anche quando la violazione arriva dall'indice in una corsa parallela (come per l'email).

### 4.3 Chiusure (solo admin)
| Metodo e rotta | Cosa fa |
| --- | --- |
| `GET /api/closures?year=2026&filter[location]=ID` | chiusure dell'anno; con `filter[location]` quelle della sede più quelle di tutte le sedi |
| `POST /api/closures` | `location_id` (null = tutte), `starts_on`, `ends_on`, `description` |
| `PATCH /api/closures/{closure}` | stessi campi, `sometimes` |
| `DELETE /api/closures/{closure}` | |

### 4.4 Orario personale (solo admin)
| Metodo e rotta | Cosa fa |
| --- | --- |
| `GET /api/users/{user}/schedules` | versioni personali, dalla più recente, e l'orario della sede che vale oggi |
| `POST /api/users/{user}/schedules` | `valid_from` e `follows_location` (true = torna all'orario della sede) oppure `minutes` |
| `DELETE /api/users/{user}/schedules/{schedule}` | solo versioni future |

### 4.5 Utenti
- **`GET /api/users`:**
  - ogni riga ha `location: {id, name}`;
  - `filter[location]` e `sort=location|-location` solo per l'admin; dal responsabile, 422 (`prohibited`).
- **`POST /api/users` (invito):**
  - admin: `location_id` facoltativo, default la principale; deve essere una sede attiva;
  - responsabile: `location_id` vietato (422); la persona finisce nella sua sede.
- **`PATCH /api/users/{user}`:**
  - `location_id` solo per l'admin (dal responsabile, 422), sede attiva;
  - su un altro admin valgono le regole di oggi: password di conferma ed email agli admin, con il nuovo
    `AdminChange::LocationChanged`;
  - l'evento `user_updated` elenca `location_id` tra i campi cambiati.
- **`POST /api/administrators/invitations`:** `location_id` facoltativo, default la principale.
- **`GET /api/administrators`:** ogni riga ha `location`.

### 4.6 Utente corrente
`GET /api/auth/user` e `PATCH /api/profile` aggiungono:
- `location: {id, name}`;
- `meta.multiple_locations`: `true` se ci sono almeno due sedi attive (§5.5).

### 4.7 Log
- Cambio sede di una persona: `auth_events` `user_updated`, come le altre modifiche.
- Creazione, modifica, archiviazione e ripristino di sedi, principale, orari e chiusure: log applicativo strutturato
  (`Log::info('Location archived', ['location_id' => …, 'actor_id' => …])`). Non sono eventi di sicurezza e non devono
  sparire con la conservazione limitata di `auth_events`.
- Nessuna email alla persona spostata in questa fase (la fase 3 aggiunge quella con le richieste ricalcolate).

## 5. Interfaccia

### 5.1 Sidebar
Solo admin: voce **Sedi** (`/admin/locations`) accanto ad Amministratori.

### 5.2 Lista sedi `/admin/locations`
- Tabella come Utenti, lista su mobile; schede **Attive** e **Archiviate** con i conteggi.
- Colonne: nome con badge **Principale**, città, persone, responsabili; con zero responsabili, badge di avviso
  **Nessun responsabile**.
- Menu di riga:
  - Apri;
  - Imposta come principale;
  - Vedi persone, che porta a `/users?location=ID`;
  - Archivia o Ripristina, con conferma. Archivia è disabilitata con il motivo quando la sede ha persone o è la
    principale.
- Pulsante **Nuova sede**: modale con nome, città, patrono (giorno e mese). Il testo spiega che l'orario parte uguale a
  quello della principale.

### 5.3 Dettaglio sede `/admin/locations/:id`
Pagina a card, come il Profilo:
- **Dati:** nome, città, patrono, con Modifica. Paese e fuso non compaiono finché c'è solo l'Italia.
- **Orario standard:** i 7 giorni con le ore (`8`, `4:30`, "Non lavorativo"); **Cambia orario** chiede da quale giorno
  vale (oggi o dopo); sotto, le versioni future (cancellabili) e quelle passate.
- **Chiusure:** elenco per anno con selettore dell'anno; quelle di tutte le sedi hanno il badge **Tutte le sedi**. Il
  form chiede "Solo questa sede / Tutte le sedi", date e descrizione.
- **Calendario dell'anno:** in sola lettura, i giorni non lavorativi con le etichette (festivo nazionale, patrono,
  chiusura) e il selettore dell'anno.

### 5.4 Utenti, Amministratori, Profilo
- **Utenti, admin:**
  - colonna **Sede** ordinabile e filtro **Sede** nel pannello filtri (parametro `location` nell'URL);
  - campo Sede nell'invito (default la principale) e in Modifica, con la nota: "La persona passa al responsabile della
    nuova sede.";
  - voce di menu **Orario di lavoro**: "Usa l'orario della sede" oppure "Orario personale" con i 7 giorni, e la data da
    cui vale.
- **Utenti, responsabile:** nessuna colonna, filtro o campo Sede; il titolo mostra la sede ("Utenti · Milano").
- **Amministratori:** colonna Sede; campo Sede in Modifica e nell'invito di un admin.
- **Profilo:** Sede in sola lettura in Dati personali, accanto a email e ruolo.

### 5.5 Una sola sede
Con `meta.multiple_locations = false` colonna, filtro, campi Sede e titolo con la sede non compaiono. La sezione Sedi
resta visibile all'admin, che da lì crea la seconda. Il menu **Orario di lavoro** resta: serve anche con una sola sede.

### 5.6 Testi
Italiano e inglese, con i plurali di i18next dove servono ("1 persona", "3 persone").

## 6. Test

### 6.1 Backend
- **Calendario italiano:** Pasqua e Pasquetta su anni noti (2024, 2025, 2026, 2038); 4 ottobre presente dal 2026 e
  assente nel 2025; anni fuori range.
- **`WorkCalendar`:**
  - orario della sede; versione futura che entra in vigore a metà intervallo;
  - orario personale, `follows_location`, persona senza orario personale;
  - patrono, chiusura della sede, chiusura di tutte le sedi, sovrapposizioni con etichette multiple;
  - intervallo oltre 366 giorni rifiutato; numero di query costante al crescere dell'intervallo.
- **Sedi:** ogni rotta di §4.2–§4.4 con la matrice 401 / 403 (responsabile, dipendente) / 404 / 422; unicità del nome
  anche in parallelo; una sola principale; archiviazione bloccata con persone o principale; ripristino; versioni passate
  non cancellabili; `valid_from` nel passato rifiutato.
- **Visibilità:**
  - il responsabile vede in lista e conteggi solo la sua sede;
  - riceve 404 su ogni azione verso una persona di un'altra sede;
  - `filter[location]` e `location_id` da lui danno 422;
  - l'invito del responsabile finisce nella sua sede;
  - cambio sede in corsa: 409 `users.state_changed`.
- **Admin:** filtro e ordinamento per sede, invito con sede, cambio sede (evento con `location_id`), cambio sede di un
  altro admin con password ed email.
- **Migration:** utenti esistenti associati alla principale.

### 6.2 Frontend
Componenti e hook con Vitest: lista e dettaglio sede, editor dell'orario (ore e mezz'ore, giorno non lavorativo, almeno
un giorno), chiusure, colonna e filtro Sede solo con più sedi, campi Sede solo per l'admin, Sede nel profilo. Test di
contrasto per i nuovi badge.

### 6.3 E2E
- L'admin crea una sede con patrono, ci sposta un responsabile e un dipendente.
- Il responsabile vede solo le persone della sua sede e riceve 404 sull'indirizzo di una persona di un'altra sede.
- Il calendario dell'anno mostra Pasquetta e il patrono nel giorno giusto.
- Con una sola sede non c'è traccia della colonna Sede.
