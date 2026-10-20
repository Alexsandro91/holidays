# Sotto-progetto 2, fase 2: tipi di assenza e saldi

Data: 20/10/2026. Il design è stato discusso in chat con l'utente, con bozze delle schermate nel browser. Le scelte
prese da me e non dall'utente sono elencate in §9 e segnate con *(scelta mia)* nel testo.

Seconda fase del sotto-progetto 2 (gestione ferie e permessi). Si appoggia sulla fase 1
(`2026-10-15-sp2-fase-1-sedi-calendario-design.md`): sedi, orari versionati, `WorkCalendar`, tipo di rapporto, scope
`User::visibleTo`. Dove divergono, vale questa.

## 1. Decisioni dell'utente

- **Oggi:** il responsabile tiene a mano i saldi di ognuno e li aggiorna ogni mese leggendoli dalla busta paga. La
  busta paga resta la fonte ufficiale.
- **Maturazione automatica:** l'app fa maturare i saldi da sola ogni mese. Admin e responsabile possono correggerli
  quando sono sbagliati.
- **Saldi tenuti in ore**, mostrati anche in giorni secondo l'orario della persona.
- **Saldo = somma dei movimenti** (maturazioni, rettifiche, allineamenti, e dalla fase 3 l'usato), non un numero da
  sovrascrivere. Ogni movimento ha data, autore e motivo. Il saldo di partenza di ognuno si inserisce con un primo
  "Allinea alla busta paga": non c'è un movimento apposito *(scelta mia)*.
- **"Allinea alla busta paga":** chi corregge scrive il valore letto in busta paga a una data; l'app crea il movimento
  che porta il saldo a quel valore.
- **Valori annui a tre livelli:** azienda, la sede eredita e può cambiarli, la persona eredita dalla sede e può avere
  valori propri (lo stesso schema degli orari della fase 1).
- **Saldi solo per i dipendenti.** Collaboratori esterni e stagisti per ora hanno solo assenze da segnare, senza saldo.
- **Tipi di assenza:** l'admin li gestisce; l'app parte con la lista del §3.2. Smart working, trasferta e formazione
  **non** sono assenze (si lavora) e restano fuori dall'app.
- **Approvazione:** malattia e infortunio non la richiedono (sono una comunicazione); la donazione di sangue sì.
- **Fine anno:** quello che non si usa si porta all'anno dopo. Nessuna scadenza, nessun azzeramento.
- **Saldi negativi ammessi** (es. ferie anticipate). Il limite sotto zero per le richieste lo decide la fase 3.
- **Anche responsabili e admin** hanno ferie e permessi propri: i saldi dipendono dal tipo di rapporto, non dal ruolo.
- **Schermate** (scelte sulle bozze):
  - scheda saldi della persona, aperta dal menu di riga in Utenti, con "Allinea alla busta paga" e "Rettifica";
  - in più una pagina **Saldi** in Gestione, solo admin e responsabili, con tutti in tabella e una barra per saldo.

### 1.1 Fuori ambito
- Richieste di assenza, approvazioni, notifiche, uso dei saldi: fase 3. Qui i tipi di assenza si **configurano** e
  basta; nessuno li usa ancora.
- Far rispettare limiti, unità, conteggio dei giorni e numero di certificato dei tipi: fase 3.
- Smart working, trasferta, formazione: fuori dall'app.
- Scadenza delle ferie, pagamento dei residui: nessuna regola. Se un domani servono, si allinea alla busta paga o si
  aggiunge una regola per saldo.
- Registrare un'assenza al posto di un'altra persona: non previsto.
- Saldi per collaboratori e stagisti.
- Data di assunzione: non esiste (fase 1, nessuna data di inizio o fine rapporto). La maturazione parte da quando la
  persona è dipendente attiva nell'app (§4.3).

## 2. Saldi

Tre saldi fissi, enum `App\Enums\BalanceType`:

| Valore | Nome |
| --- | --- |
| `vacation` | Ferie |
| `rol` | ROL |
| `ex_holidays` | Ex festività |

ROL ed ex festività restano separati perché in busta paga sono due righe distinte e si allineano uno per uno. L'admin
non crea altri saldi.

**Unità:** minuti interi in database e nell'API, come gli orari della fase 1. L'interfaccia mostra ore decimali con
al massimo due cifre ("87,5 h", "74,42 h"), come in busta paga, e le accetta in input; il valore si arrotonda al minuto.

**Giorni equivalenti** *(scelta mia)*: solo per le ferie, "≈ 10,9 gg", con una cifra decimale. Giorno medio = minuti
settimanali dell'orario valido oggi ÷ numero di giorni con minuti > 0 in quella settimana. ROL ed ex festività si
mostrano solo in ore.

## 3. Tipi di assenza

### 3.1 Dati: `absence_types`
| Colonna | Tipo | Note |
| --- | --- | --- |
| `id` | bigint | |
| `code` | string(40), null, unico | codice dei tipi di partenza (`vacation`, `sickness`, …); `NULL` per quelli creati dall'admin; non modificabile |
| `name` | string(100), null | obbligatorio per i tipi creati dall'admin; per i tipi di partenza `NULL` = nome tradotto da `lang/*/absence_types.php`, un valore scritto dall'admin lo sostituisce in tutte le lingue |
| `allows_days` | bool | si chiede a giorni interi |
| `allows_half_days` | bool | si chiede a mezze giornate |
| `allows_hours` | bool | si chiede a ore |
| `balance` | string, null | `BalanceType` da cui scala; `NULL` = nessun saldo |
| `requires_approval` | bool | |
| `employment_types` | json | elenco di `EmploymentType` a cui vale, almeno uno |
| `requires_enablement` | bool | vale solo per le persone abilitate (es. legge 104), §3.4 |
| `day_count` | string | `working` (giorni lavorativi) o `calendar` (giorni di calendario) *(scelta mia, serve alla fase 3)* |
| `requires_certificate` | bool | chiede il numero di protocollo del certificato *(usato dalla fase 3)* |
| `limit_amount` | smallint unsigned, null | tetto facoltativo |
| `limit_unit` | string, null | `days` o `hours` |
| `limit_period` | string, null | `month`, `year` o `request` (per singola richiesta, es. congedo matrimoniale) |
| `position` | smallint unsigned | ordine di visualizzazione |
| `archived_at` | timestamp, null | |
| timestamps | | |

**Regole (422 sul campo):**
- almeno una tra `allows_days`, `allows_half_days`, `allows_hours`;
- `allows_half_days` richiede `allows_days`;
- un tipo con `balance` vale solo per `employee` (collaboratori e stagisti non hanno saldi);
- i tre campi del limite sono tutti valorizzati o tutti `NULL`; `limit_amount` ≥ 1;
- `name` unico tra i tipi (case-insensitive, archiviati compresi), confrontato anche con il nome tradotto dei tipi di
  partenza nella lingua di chi scrive.

**Archiviazione, mai cancellazione** *(scelta mia)*: dalla fase 3 le richieste puntano ai tipi. Un tipo archiviato non
compare tra quelli richiedibili ma resta leggibile. Anche i tipi di partenza si possono modificare e archiviare; solo il
`code` non cambia.

### 3.2 Tipi di partenza
Inseriti dalla migration, valori letterali (come la sede principale nella fase 1). Tutto modificabile dall'admin.
Limiti e conteggi sono una proposta mia sulle regole di legge più comuni.

| code | Nome | Giorni / mezze / ore | Saldo | Approvazione | Vale per | Altro |
| --- | --- | --- | --- | --- | --- | --- |
| `vacation` | Ferie | sì / sì / no | `vacation` | sì | dipendenti | |
| `rol` | ROL | no / no / sì | `rol` | sì | dipendenti | |
| `ex_holidays` | Ex festività | no / no / sì | `ex_holidays` | sì | dipendenti | |
| `sickness` | Malattia | sì / no / no | — | no | tutti | calendario, certificato |
| `injury` | Infortunio | sì / no / no | — | no | tutti | calendario, certificato |
| `medical_visit` | Visita medica | no / no / sì | — | sì | tutti | |
| `law_104` | Legge 104 | sì / no / sì | — | sì | tutti | abilitazione; limite 3 giorni al mese |
| `bereavement` | Lutto | sì / no / no | — | sì | tutti | limite 3 giorni all'anno |
| `marriage_leave` | Congedo matrimoniale | sì / no / no | — | sì | dipendenti | calendario; limite 15 giorni per richiesta |
| `blood_donation` | Donazione di sangue | sì / no / no | — | sì | tutti | |
| `maternity_leave` | Maternità | sì / no / no | — | sì | tutti | calendario |
| `paternity_leave` | Paternità | sì / no / no | — | sì | tutti | |
| `parental_leave` | Congedo parentale | sì / sì / sì | — | sì | tutti | |
| `election_leave` | Permesso elettorale | sì / no / no | — | sì | tutti | |
| `study_leave` | Permesso studio | no / no / sì | — | sì | dipendenti | |
| `unpaid_leave` | Permesso non retribuito | sì / no / sì | — | sì | tutti | |

"Calendario" = `day_count = calendar`; dove non indicato, `working`. "Tutti" = dipendenti, collaboratori, stagisti.

### 3.3 API (solo admin, `AbsenceTypePolicy`)
| Metodo e rotta | Cosa fa |
| --- | --- |
| `GET /api/absence-types` | lista per `position`; `filter[status]=active\|archived` (default `active`); `meta.counts` per stato; ogni riga ha `name` già risolto, `is_system` (ha un `code`) e `enabled_users_count` per i tipi con abilitazione |
| `POST /api/absence-types` | tutti i campi tranne `code`; va in fondo (`position` = max + 1); 201 |
| `PATCH /api/absence-types/{absenceType}` | stessi campi, `sometimes`; per un tipo di partenza `name: null` ripristina il nome tradotto |
| `POST /api/absence-types/{absenceType}/archive` e `/restore` | |
| `PUT /api/absence-types/order` | elenco completo degli id attivi nel nuovo ordine; 422 se l'elenco non coincide |

Log applicativo strutturato su creazione, modifica, archiviazione, ripristino e riordino (come per le sedi).

### 3.4 Abilitazioni
Tabella `absence_type_user` (`absence_type_id`, `user_id`, `created_at`, `actor_id` null), unica sulla coppia. Vale solo
per i tipi con `requires_enablement`.

- **Chi:** solo l'admin *(scelta mia)*. Il responsabile non le vede in questa fase: le incontrerà nelle richieste della
  fase 3.
- **Dove:** nuova voce **Tipi di assenza** nel menu di riga di Utenti, solo admin, per qualunque persona (anche
  collaboratori e stagisti, per cui vale la legge 104). Apre una modale con i tipi che valgono per la persona e le
  caselle di abilitazione per quelli che la richiedono *(scelta mia)*.
- **API:** `GET /api/users/{user}/absence-types` restituisce i tipi attivi che valgono per quella persona (per tipo di
  rapporto), con `enabled` per quelli che richiedono abilitazione; `PUT /api/users/{user}/absence-type-enablements`
  con `absence_type_ids` (sostituisce l'elenco; ogni id deve essere un tipo con `requires_enablement`). Scope e 404 come
  fase 1 §4.1.
- Cambiare tipo di rapporto non cancella le abilitazioni.

## 4. Maturazione

### 4.1 Valori annui: `accrual_settings`
Una riga per livello:

| Colonna | Tipo | Note |
| --- | --- | --- |
| `id` | bigint | |
| `location_id` | FK, null, unico | riga della sede |
| `user_id` | FK, null, unico, `cascadeOnDelete` | riga della persona |
| `vacation_minutes`, `rol_minutes`, `ex_holidays_minutes` | int unsigned, null | monte annuo per un tempo pieno; `NULL` = eredita dal livello sopra |
| timestamps | | |

- La riga con `location_id` e `user_id` entrambi `NULL` è quella dell'**azienda**: esiste sempre, una sola (la crea la
  migration; il servizio la blocca e la aggiorna, mai una seconda). Nella riga azienda i tre valori sono obbligatori.
- Al massimo uno tra `location_id` e `user_id`.
- **Valore effettivo** per persona e saldo: persona, se non `NULL`, altrimenti sede, altrimenti azienda.
- **Valori di partenza** (migration): ferie 9600 minuti (160 h = 4 settimane a 40 ore, minimo di legge), ROL 0,
  ex festività 0. L'admin li corregge con i numeri del contratto.
- **Non versionati** *(scelta mia)*: un cambio vale dalla prossima maturazione. Le maturazioni già fatte sono movimenti
  e non cambiano.
- **Chi:** solo l'admin, a tutti e tre i livelli.

### 4.2 Quanto matura al mese
`quota = round(valore_annuo × minuti_settimanali_persona ÷ minuti_settimanali_sede ÷ 12)`, arrotondata al minuto
(half-up).

- **Giorno di riferimento** *(scelta mia)*: il primo del mese, oppure, se la persona ha diritto solo da un giorno
  successivo dello stesso mese (§4.3), quel giorno. Così chi entra part-time il 10 con un orario personale valido dal 10
  matura già il primo mese con il suo orario.
- **Minuti settimanali della persona:** somma dei 7 giorni dell'orario valido il giorno di riferimento (personale,
  oppure quello della sede se manca o è `follows_location`). Le versioni passate degli orari restano in tabella, quindi
  vale anche per un mese passato. Festivi e chiusure non contano: è la proporzione del contratto.
- **Minuti settimanali della sede:** somma dei 7 giorni dell'orario standard della sede attuale valido quel giorno.
- Se l'admin imposta l'orario part-time solo dopo che il mese è già maturato, la quota di quel mese resta a tempo pieno
  e si corregge con un allineamento.
- Così il part-time orizzontale e quello verticale si gestiscono da soli; un cambio d'orario cambia la quota dal mese
  dopo. Un orario personale più lungo di quello della sede dà una quota maggiore (nessun tetto).
- Un valore annuo pari a 0 non crea movimenti.

### 4.3 Chi matura e quando
- **Dipendente attivo** in un giorno = `employment_type = employee` e account attivo (accettato, non disattivato) in
  quel giorno. Lo stato di un giorno passato si ricostruisce dallo storico di fase 1 (`user_history`: `imported`,
  `invited`, `activated`, `disabled`, `enabled`, `employment_type_changed`), che c'è per ogni utente.
- **Regola** *(scelta mia, regola dei 15 giorni)*: il mese M matura per chi è dipendente attivo **il 1° di M oppure il
  16 di M** (cioè chi è in forza almeno da metà mese). Chi smette durante M tiene la quota di M.
- **Job:** comando `balances:accrue`, schedulato **ogni giorno** (`onOneServer`, `withoutOverlapping`) nel fuso
  `Europe/Rome`. A ogni giro, per il mese corrente, matura chi non ha ancora la quota e risulta già avere diritto: era
  dipendente attivo il 1°, oppure (dal giorno 2 al 16) lo è da quando lo è diventato, oppure (dal 16 in poi) lo era il
  16. Se il server è fermo per giorni, il primo giro utile recupera dallo storico; al rilascio in produzione, il mese
  corrente matura per tutti quelli che hanno diritto secondo lo storico.
- **Idempotenza:** unico su (`user_id`, `balance`, `period`) per i movimenti `accrual`. Una corsa tra due giri non crea
  doppioni: il secondo inserimento fallisce sull'indice e si salta.
- **Opzione `--month=YYYY-MM`** per recuperare a mano un mese passato: stessa regola del 1°/16 sullo storico, orari
  validi il giorno di riferimento (§4.2), valori annui e sede attuali. Non fa nulla per chi ha già quel mese, né per un
  saldo che ha un allineamento con data uguale o successiva al 1° di quel mese (§5.2: la busta paga lo comprende già).
- **Fuso:** "oggi" e "il primo del mese" nel fuso della sede della persona (oggi sempre `Europe/Rome`).

## 5. Movimenti: `balance_movements`

| Colonna | Tipo | Note |
| --- | --- | --- |
| `id` | bigint | |
| `user_id` | FK, `cascadeOnDelete` | |
| `balance` | string | `BalanceType` |
| `kind` | string | enum `BalanceMovementKind`: `accrual`, `adjustment`, `alignment`, `usage` (riservato alla fase 3) |
| `minutes` | int (con segno) | variazione |
| `effective_on` | date | data contabile: il primo del mese per `accrual`, la data della busta paga per `alignment`, oggi per `adjustment` |
| `period` | char(7), null | `YYYY-MM`, solo per `accrual` |
| `target_minutes` | int, null | solo per `alignment`: il valore letto in busta paga |
| `note` | string(255), null | obbligatoria per `adjustment`, facoltativa per `alignment` |
| `actor_id` | FK, null, `nullOnDelete` | null per la maturazione automatica |
| `created_at` | timestamp | |

- **Immutabili** *(scelta mia)*: nessuna modifica né cancellazione. Un errore si corregge con un altro movimento.
- **Indici:** unico (`user_id`, `balance`, `period`) (i `NULL` di `period` non collidono); (`user_id`, `balance`,
  `effective_on`).
- **Saldo a una data D** = somma dei `minutes` con `effective_on ≤ D`. **Saldo attuale** = saldo a oggi (le
  maturazioni del mese corrente sono già comprese).

### 5.1 Rettifica
Saldo, minuti con segno (≠ 0), motivo obbligatorio. `effective_on` = oggi.

### 5.2 Allinea alla busta paga
- **Input:** data della busta paga D (≤ oggi), e per ciascuno dei tre saldi un valore facoltativo in minuti; almeno uno.
  Nota facoltativa.
- **Per ogni saldo indicato:** `delta = valore − saldo a D`. Se `delta ≠ 0` si scrive un movimento `alignment` con
  `effective_on = D`, `minutes = delta`, `target_minutes = valore`. Se `delta = 0` non si scrive nulla, ma l'allineamento
  conta come fatto *(scelta mia: l'interfaccia mostra "già allineato")*.
- I movimenti con data dopo D (es. la maturazione del mese dopo) restano e si sommano al valore allineato: la busta
  paga di settembre non conosce ottobre.
- **Mai prima dell'ultimo allineamento** *(scelta mia)*: per un saldo che ha già un allineamento con data D', un nuovo
  allineamento con D < D' dà 422 sul campo data ("C'è già un allineamento al <D'>"). Con D = D' si può (corregge un
  valore sbagliato). La maturazione di un mese passato non scrive nulla prima di un allineamento (§4.3). Così un
  allineamento registrato non viene mai spostato da movimenti successivi con data precedente. La fase 3 deciderà come
  trattare l'usato con data precedente.
- **Concorrenza:** la riga dell'utente si blocca (`lockForUpdate`) per il calcolo e la scrittura, sia qui sia nella
  maturazione e nella rettifica.
- **Ultimo allineamento** di una persona = `effective_on` massimo tra i suoi movimenti `alignment` e gli allineamenti
  con `delta = 0`. Per tenerli tutti, ogni allineamento salva una riga in `balance_alignments` (`user_id`,
  `aligned_on`, `actor_id`, `created_at`) *(scelta mia)*, indice su (`user_id`, `aligned_on`).

### 5.3 Riepilogo dell'anno
Per ogni saldo e anno Y (nel fuso della sede):
- **Residuo al 1° gennaio:** saldo al 31/12 dell'anno prima;
- **Maturato:** somma degli `accrual` di Y;
- **Usato:** somma degli `usage` di Y (0 fino alla fase 3);
- **Correzioni:** somma di `adjustment` e `alignment` di Y *(scelta mia: serve perché i numeri tornino)*;
- **Saldo:** per l'anno in corso il saldo attuale, per un anno passato il saldo al 31/12.

Residuo + maturato + usato + correzioni = saldo.

## 6. Permessi e API

### 6.1 Chi vede e chi corregge
- **Vedere i saldi:** ognuno i propri; il responsabile quelli delle persone della sua sede; l'admin tutti. Scope e 404 di
  fase 1 §4.1. Un responsabile non vede i saldi di un admin (stessa regola di fase 1 sugli admin).
- **Rettifica e allineamento:** admin su chiunque tranne sé stesso; responsabile sulle persone della sua sede tranne sé
  stesso e gli admin *(scelta mia: nessuno corregge i propri saldi)*.
- **A chi si applicano:** a chi è dipendente con account attivo o disattivato, e a chi non è più dipendente ma ha
  movimenti (per poter correggere un residuo). Non agli invitati *(scelta mia: il saldo di partenza si inserisce dopo
  l'attivazione)*. Altrimenti 409 `balances.not_applicable`.
- **Valori annui e abilitazioni:** solo admin.

### 6.2 Rotte
| Metodo e rotta | Chi | Cosa fa |
| --- | --- | --- |
| `GET /api/balances` | admin, responsabile | tabella della pagina Saldi (§7.2): paginata (25), `filter[search]` (nome o email), `filter[location]` solo admin (dal responsabile 422 `prohibited`), `filter[negative]=1`, `sort=name\|-name`; solo dipendenti attivi o con movimenti, attivi e disattivati esclusi gli invitati *(scelta mia: i disattivati non compaiono)* |
| `GET /api/users/{user}/balances?year=` | admin, responsabile | riepilogo §5.3 per i tre saldi; per ognuno valore annuo effettivo con provenienza (`company`, `location`, `user`) e quota mensile attuale; giorni equivalenti; ultimo allineamento; `can.adjust`, `can.manage_accrual` (solo admin) |
| `GET /api/users/{user}/balance-movements?balance=&year=` | admin, responsabile | movimenti dal più recente, 20 per pagina, con nome di chi ha agito |
| `POST /api/users/{user}/balance-adjustments` | §6.1 | `balance`, `minutes`, `note`; 201 |
| `POST /api/users/{user}/balance-alignments` | §6.1 | `aligned_on`, `values: {vacation?, rol?, ex_holidays?}` in minuti (anche negativi), `note`; restituisce i delta per saldo |
| `GET /api/profile/balances?year=` | chiunque | come sopra per sé; per collaboratori e stagisti senza movimenti, `applicable: false` |
| `GET /api/profile/balance-movements?balance=&year=` | chiunque | come sopra, **senza** chi ha agito (come lo storico di fase 1) |
| `GET /api/settings/accrual` / `PATCH` | admin | valori dell'azienda |
| `GET /api/locations/{location}/accrual` / `PUT` | admin | valori della sede (`null` = eredita) e quelli effettivi |
| `GET /api/users/{user}/accrual` / `PUT` | admin | valori della persona (`null` = eredita) e quelli effettivi, con la provenienza (azienda, sede, persona) |

Ogni riga di `GET /api/balances` ha: persona (nome, ruolo, sede, minuti settimanali), per ogni saldo il saldo attuale e
il valore annuo effettivo proporzionato (per la barra), data dell'ultimo allineamento, `can.adjust`.

**Prestazioni:** `GET /api/balances` usa un numero di query costante rispetto alle righe (saldi con una `SUM … GROUP BY`,
orari e valori annui caricati per la pagina), coperto da test.

### 6.3 Log
- Rettifiche e allineamenti sono già un registro (i movimenti, con autore). In più `Log::info` strutturato.
- Cambi dei valori annui e delle abilitazioni: `Log::info` con prima e dopo.
- Niente righe in `user_history` *(scelta mia)*: lo storico di fase 1 resta per ruolo, tipo, sede e stato.

## 7. Interfaccia

### 7.1 Sidebar
- **Ferie e permessi** (`/leave`, oggi disattivata con "presto"): si attiva per tutti. Mostra "I miei saldi".
- **Gestione → Saldi** (`/balances`): admin e responsabili.
- **Gestione → Tipi di assenza** (`/admin/absence-types`): solo admin, accanto a Sedi.
- **Gestione → Impostazioni** (`/admin/settings`): solo admin, con la card "Maturazione annua" *(scelta mia: una pagina
  di impostazioni dell'azienda, non la sede principale, che può cambiare)*.

### 7.2 Pagina Saldi (`/balances`)
Approvata sulla bozza:
- tabella come Utenti, lista su mobile; filtri: ricerca per nome, Sede (solo admin con più sedi), "Solo saldi negativi";
  parametri nell'URL come Utenti;
- colonne: persona (nome, sotto ruolo e ore settimanali, "part-time" se meno della sede), Ferie (ore e giorni), ROL,
  Ex festività, Ultimo allineamento ("mai" evidenziato), menu;
- sotto ogni saldo una barra: saldo ÷ valore annuo effettivo, da 0 a 100%; rossa se il saldo è negativo; nessuna barra
  se il valore annuo è 0;
- click sul nome apre la scheda saldi (§7.3); menu di riga: Apri saldi, Allinea alla busta paga, Rettifica (gli ultimi
  due solo con `can.adjust`);
- intestazione "Saldi al <oggi> · in ore"; il responsabile vede la sua sede nel titolo come in Utenti.

### 7.3 Scheda saldi della persona
Modale grande, aperta dalla pagina Saldi e dalla nuova voce **Saldi** del menu di riga in Utenti (solo per chi ha
saldi). Approvata sulla bozza:
- riga in alto: ore settimanali e sede; pulsanti **Allinea alla busta paga** e **Rettifica** (con `can.adjust`);
- tre riquadri (Ferie, ROL, Ex festività): saldo grande (rosso se negativo), giorni per le ferie, e sotto residuo al 1°
  gennaio, maturato, usato, correzioni (§5.3); selettore dell'anno;
- **Movimenti:** elenco dal più recente con data, saldo, descrizione ("Maturazione ottobre", "Allineata alla busta paga
  del 30/09: da 82 h a 74,2 h", "Rettifica: <motivo>"), autore e ore con segno; filtri per saldo e anno; "Carica altre";
- sezione **Valori annui**: per ogni saldo il valore effettivo e da dove viene ("Come la sede: 160 h", "Valore
  personale: 200 h") con la quota mensile. L'admin (`can.manage_accrual`) lo cambia: eredita oppure un valore proprio.
  Il responsabile la vede in sola lettura, con i dati di `GET /api/users/{user}/balances`. Le abilitazioni non sono qui
  (§3.4).
- **Voce Saldi in Utenti:** compare per chi ha saldi secondo §6.1 (non per gli invitati).

### 7.4 Allinea alla busta paga (modale)
Approvata sulla bozza: data della busta paga (default l'ultimo giorno del mese precedente *(scelta mia)*), tabella con
per ogni saldo il valore nell'app a quella data e un campo "In busta paga" (vuoto = non toccare), anteprima del delta
("verrà registrato un movimento di −7,8 h"), nota facoltativa, pulsante **Allinea**. A fine operazione un messaggio con
i saldi aggiornati.

### 7.5 Rettifica (modale)
Saldo, ore in più o in meno (segno esplicito, due pulsanti "Aggiungi" / "Togli" + valore), motivo obbligatorio,
anteprima del saldo risultante.

### 7.6 Ferie e permessi (`/leave`)
- **Dipendente** (o chi ha movimenti): la stessa scheda di §7.3 in pagina, senza pulsanti, senza autore dei movimenti e
  senza Valori annui; con l'elenco dei tipi di assenza che valgono per sé (solo lettura, introduce la fase 3).
- **Collaboratore o stagista senza movimenti:** testo che spiega che non ha saldi e che qui potrà segnare le assenze, più
  l'elenco dei tipi che valgono per lui.

### 7.7 Tipi di assenza (`/admin/absence-types`)
Tabella come Sedi, con schede Attivi e Archiviati:
- colonne: nome (badge "Predefinito" per i tipi con `code`), come si chiede (Giorni, Mezze giornate, Ore), saldo,
  approvazione, vale per, limite;
- riordino con trascinamento e, per tastiera, voci di menu "Sposta su" / "Sposta giù";
- menu di riga: Modifica, Archivia / Ripristina (con conferma), "Ripristina nome predefinito" per i tipi di partenza
  rinominati;
- **Nuovo tipo** / **Modifica**: modale con tutti i campi di §3.1 (nome, come si chiede, saldo, approvazione, vale per,
  abilitazione, giorni lavorativi o di calendario, certificato, limite). Scegliendo un saldo, "Vale per" si blocca su
  Dipendenti con una nota che spiega perché.

### 7.8 Impostazioni (`/admin/settings`) e dettaglio sede
- **Impostazioni → Maturazione annua:** tre campi in ore per un tempo pieno, con la quota mensile; testo che spiega che
  sedi e persone ereditano e che un cambio vale dalla prossima maturazione.
- **Dettaglio sede:** nuova card **Maturazione annua**: per ogni saldo "Come l'azienda (160 h)" oppure un valore della
  sede.

### 7.9 Testi
Italiano e inglese, plurali i18next. Ore decimali con la virgola in italiano.

## 8. Test

### 8.1 Backend
- **Tipi:** CRUD, archivio, riordino, ogni regola di §3.1 (422), nome tradotto e sostituito, matrice 401/403
  (responsabile, dipendente)/404/422; migration con i 16 tipi di partenza.
- **Abilitazioni:** solo admin; solo tipi con `requires_enablement`; scope 404.
- **Valori annui:** ereditarietà persona → sede → azienda; `null` eredita; riga azienda unica e obbligatoria.
- **Maturazione:** quota a tempo pieno; part-time orizzontale e verticale; orario personale `follows_location`; valore
  0 senza movimento; regola del 16; collaboratore, stagista, invitato, disattivato esclusi; cambio di tipo a metà mese;
  idempotenza (due giri, corsa parallela); `--month`; recupero il giorno dopo; arrotondamento.
- **Movimenti:** rettifica (motivo obbligatorio, segno); allineamento (delta, data passata con movimenti successivi,
  delta 0, valori negativi, data futura rifiutata); riepilogo dell'anno che torna; immutabilità (nessuna rotta di
  modifica).
- **Permessi:** ogni rotta di §6.2 con la matrice; nessuno corregge i propri saldi; responsabile su admin 404; fuori
  sede 404; `filter[location]` dal responsabile 422; profilo senza autore; `balances.not_applicable`.
- **Prestazioni:** `GET /api/balances` con numero di query costante.

### 8.2 Frontend
Pagina Saldi (filtri, barre, negativo, "mai"), scheda saldi (riquadri, movimenti, sezioni solo admin), Allinea
(anteprima del delta, campi vuoti), Rettifica, Ferie e permessi per dipendente e per stagista, Tipi di assenza (regole
del form, "Vale per" bloccato con un saldo, riordino da tastiera), Impostazioni e card della sede. Formato delle ore in
italiano e inglese. Test di contrasto per barra rossa e badge.

### 8.3 E2E
- L'admin imposta 160 h di ferie e 72 h di ROL; dopo una maturazione lanciata dal setup, un dipendente a tempo pieno e
  uno part-time al 50% hanno le quote giuste.
- Il responsabile allinea un dipendente alla busta paga e vede il movimento; il dipendente vede il saldo in Ferie e
  permessi senza l'autore.
- Il responsabile non trova "Rettifica" sui propri saldi né la pagina Tipi di assenza.
- L'admin crea un tipo con abilitazione e abilita una persona.

## 9. Scelte mie (da verificare leggendo)
1. Giorni equivalenti solo per le ferie, con giorno medio dall'orario (§2).
2. Tipi archiviati e non cancellati; anche quelli di partenza modificabili e archiviabili (§3.1).
3. Limiti, unità e conteggio dei giorni dei tipi di partenza (§3.2), `day_count` e `limit_period = request`.
4. Abilitazioni solo dall'admin, da una voce "Tipi di assenza" nel menu di riga di Utenti (§3.4).
5. Valori annui non versionati: un cambio vale dalla prossima maturazione (§4.1).
6. Regola del 16 per chi entra o diventa dipendente a metà mese (§4.3).
7. Movimenti immutabili (§5).
8. Riga "Correzioni" nel riepilogo (§5.3).
9. Nessuno corregge i propri saldi (§6.1).
10. Disattivati e invitati fuori dalla pagina Saldi (§6.2).
11. Niente tappe nello storico della persona per saldi e valori annui (§6.3).
12. Nuova pagina Impostazioni per i valori dell'azienda (§7.1).
13. Data proposta per l'allineamento: ultimo giorno del mese precedente (§7.4).
14. Saldo di partenza inserito con un primo allineamento, senza un movimento apposito (§1).
15. Diritto alla maturazione ricostruito dallo storico di fase 1, regola "dipendente attivo il 1° o il 16" (§4.3).
16. Quota del primo mese con l'orario valido dal giorno di ingresso (§4.2).
17. Nessun allineamento con data precedente all'ultimo; nessuna maturazione passata prima di un allineamento (§5.2).
18. Il responsabile vede i valori annui in sola lettura, non le abilitazioni (§3.4, §7.3).
19. Niente rettifiche e allineamenti sugli invitati (§6.1).
