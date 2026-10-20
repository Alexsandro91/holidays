@AGENTS.md

# Holidays — backend Laravel

## Ambiente
- Sviluppo con **Sail** (Docker): `artisan`, `composer`, test e Pint vanno eseguiti con `vendor/bin/sail ...`.
- Il DB e' raggiungibile solo dai container (`DB_HOST=mysql`); dal Mac e' su `localhost:3307`.
- Laravel espone **solo API**: il frontend e' l'app React separata in `../react` (Vite).
- Boost: `AGENTS.md` e' generato da `boost:update`, non modificarlo a mano. Le regole di progetto stanno qui.
- Qualità: `sail artisan test --compact`, `sail composer analyse` (Larastan), `sail bin pint <file PHP modificati> --format agent`
  (formattazione) e `sail bin pint --test` (controllo di tutto il progetto). `--dirty` non funziona perche' il container
  non vede la cartella .git della root.
- Utenti di sviluppo (solo `local`, `sail artisan migrate:fresh --seed`): `admin@holidays.test`, `manager@holidays.test`,
  `employee@holidays.test` con password `holidays-dev-password` (più `reset@holidays.test`, riservato all'E2E del recupero password: la password cambia a ogni esecuzione; `profile@holidays.test`, riservato all'E2E del profilo); i codici di login arrivano su Mailpit (`localhost:8025`).
- Auth: login = pipeline Fortify con `StartEmailLoginChallenge` (niente sessione fino al codice); codice in
  `TwoFactorChallengeController`; chiavi di sessione in `App\Support\AuthSession`; testi PHP con `App\Support\Translate::text()`.
- Primo admin: `sail artisan app:create-admin Nome Cognome email@azienda.it` (nome e cognome sono argomenti separati, tra virgolette se composti: `Mario "De Rossi"`; invito come gli altri, nessuna password da terminale). Rilanciato sulla stessa email rimanda l’invito; se esiste già un admin attivo serve `--force`.
- Inviti: link valido 72 ore, attivazione su `/invitation/:token`. Un nuovo admin nasce per promozione di un utente attivo
  o per invito (`POST /api/administrators/invitations`, con password di conferma) dalla sezione "Amministratori", oppure con
  il comando sopra; l'invito normale (`POST /api/users`) non accetta mai il ruolo admin.
- Permessi (`UserPolicy`): la gestione utenti è di responsabile e admin, ma il responsabile non agisce mai sugli admin; la
  sezione Amministratori è solo dell'admin (`manageAdministrators`). I servizi ricontrollano attore e permesso sulle righe
  bloccate (destinatario cambiato nel frattempo: 409 `users.state_changed`; chi agisce declassato o disattivato: 403
  `users.no_longer_allowed`). Una violazione dell'indice unico sull'email (richieste parallele) diventa 422 su `email`.
- Utenti: `first_name` e `last_name` (il nome completo è l'accessor `name`); regole comuni in `App\Support\PersonRules`.
  L'email si modifica solo per gli invitati (nuovo link). Eventi con campi cambiati in `auth_events.changed_fields`
  (solo i nomi, mai i valori).
- Profilo (`ProfileController`, sotto `auth:sanctum`, nessuna policy: agisce sempre su `$request->user()`): `PATCH /api/profile`
  (nome, cognome, `locale`) e `PUT /api/profile/password` (password attuale con lo stesso blocco/contatore delle azioni
  admin ma eventi `password_change_*`; chiude le altre sessioni). `GET /api/auth/user` e `PATCH /api/profile` aggiungono
  `meta.session` (`CurrentUserResource`).
- Sedi (`Location`, solo admin, `LocationPolicy`): sempre una e una sola principale (`primary_marker` unico), si archiviano e non si cancellano. Ogni utente ha `location_id` ed `employment_type` (`EmploymentType`: dipendente, collaboratore esterno, stagista; lo stagista è solo `employee`, che nell'interfaccia si chiama "Utente"). Il responsabile vede e gestisce solo la sua sede: lo scope `User::visibleTo()` vale per la lista e per la risoluzione di `{user}` (fuori sede: 404). Giorni lavorativi solo da `WorkCalendar` (orario personale o della sede, festivi nazionali da `HolidayCalendars`, patrono, chiusure). Lo storico della persona (`user_history`) lo scrive solo `UserHistoryRecorder`, nella stessa transazione della modifica.
- Saldi (ferie, ROL, ex festività): il saldo è sempre la somma dei movimenti (`balance_movements`), mai un valore memorizzato. Le scritture passano solo da `BalanceAccrualService` (maturazione mensile) e `BalanceCorrectionService` (rettifiche e allineamenti alla busta paga), sotto lock della riga dell'utente; le letture solo da `BalanceLedger`. I movimenti sono immutabili: si corregge con un nuovo movimento, mai con update o delete. La pagina Saldi (`GET /api/balances`) legge tutto a blocchi (`BalanceLedger::currentFor`, `AccrualSettingsService::forUsers`, `WeeklyMinutes::forUsers`). La versione dell'orario in vigore la sceglie solo `ScheduleVersions`.
- Richieste (`LeaveRequest` con i suoi giorni in `LeaveRequestDay`): stati `pending`, `approved`, `rejected`, `withdrawn`, `cancellation_requested`, `cancelled` (`LeaveRequestStatus`: attive sono pending, approved e cancellation_requested; addebitano il saldo approved e cancellation_requested). Le colonne di stato e di appartenenza (`status`, `user_id`, `location_id`, `decided_by`, `cancelled_by`, `source`, `minutes`, `working_days`) si scrivono solo con `forceFill` in `LeaveRequestService`, l'unico servizio delle transizioni (sotto lock della riga dell'utente, email in coda dopo il commit); i minuti li calcola solo `LeaveCalculator` su `WorkCalendar`. I movimenti `usage` li scrive solo `LeaveUsageWriter` (`charge` e `refund`, chiamato dal servizio): un movimento per richiesta e per mese, con `effective_on` al primo giorno di assenza di quel mese, mai update o delete (l'annullamento scrive movimenti positivi). Gli avvisi (saldo, limite del tipo) sono di `LeaveAvailability` e non bloccano; la policy `LeaveRequestPolicy` è bool e senza query; i destinatari delle email e Da approvare (`GET /api/approvals`, contatore `meta.pending_approvals`) sono di `LeaveApprovers`. Alla disattivazione di una persona `UserManagementService` ritira le sue richieste pending e annulla quelle approvate non ancora iniziate.

## Approccio
Questo progetto segue le **best practice Laravel** (guideline e skill Boost), non lo scaffolding del
template Dieffetech. Delle convenzioni Dieffetech valgono **solo** le regole elencate sotto: se una guida
`dieffetech-docs` dice altro, vince questo file.

## Regole di progetto

### Codice
- **Identificatori in inglese**: variabili, metodi, classi, costanti, tabelle e colonne DB
  (`$dueDate`, `calculateTotal()`, `bookings.checked_in_at`). In italiano solo le stringhe rivolte
  all'utente e i termini di dominio senza equivalente (`codiceFiscale`, `partitaIva`).
- **Commenti in italiano**, in tutto il progetto (mai misti italiano/inglese).
- **`env()` solo dentro `config/`**: altrove `config('foo.bar')`; per l'ambiente
  `app()->environment('production')`. Dopo `config:cache` `env()` ritorna `null`.
- **Niente magic string**: valori ripetuti come backed Enum in `app/Enums/` o costanti.
- **Float**: mai confronto con `==`/`===`, usare una tolleranza (epsilon).

### Errori e log
- **Mai `catch` silenziosi**: l'eccezione va sempre loggata (o rilanciata).
- **Log strutturato**: context array (`Log::info('Booking created', ['booking_id' => $id])`), mai
  concatenazione; eccezioni come `['exception' => $e]`, non `$e->getMessage()`.
- Vietati nel codice committato: `dd()`, `dump()`, `ray()`, `var_dump()`, `print_r()`.
- **Integrazioni esterne**: ogni chiamata a un servizio esterno va loggata, su un channel dedicato
  (`Log::channel('stripe')`).

### Database
- **Migration immutabili** una volta in produzione: si corregge con una nuova migration.
  Nelle migration niente classi Enum (valori letterali) e niente business logic.
- **Query raw su tabelle con soft delete** (`whereRaw`, `selectRaw`): includere `deleted_at IS NULL`
  e gli altri scope globali.
- **Performance**: mai `::create()`/`save()` dentro un loop (usare insert/upsert batch), paginazione
  sulle liste, select mirate, niente query senza limite su tabelle che crescono.

### API
- **Output sempre tramite API Resource**: mai ritornare model o array raw dal controller.
  Niente query dentro `toArray()` (usare `whenLoaded`), mai esporre password, token o secret.
- **Validazione in FormRequest** per store/update. Enum con `Rule::enum(Foo::class)`, mai `in:a,b`;
  `unique` su tabelle con soft delete con `->withoutTrashed()`, su update con `->ignore(...)`.
- **Autorizzazione con Policy native Laravel** (`make:policy`, `Gate`, `$this->authorize()` /
  `can` middleware). Metodi che ritornano `bool`, senza side-effect.

### Email
- Invio **dopo il commit** della transazione (`DB::afterCommit(...)` o Mailable `afterCommit()`):
  un errore di invio non deve annullare il salvataggio.
- Mai `Mail::to()` in un loop sincrono: invii multipli via queue/job.

### Ambienti
- Produzione e' `APP_ENV=production` (non `prod`). Lo staging non deve essere indicizzabile
  (`X-Robots-Tag: noindex` / robots).

## Da NON seguire (regole Dieffetech escluse in questo progetto)
- Classi base del template: `BaseModel`, `BaseController`, `BaseResource`, `BaseRequest`.
- Macro `Route::api()`: usare `Route::apiResource()` e le route standard Laravel.
- `WithTransactionMiddleware`, `GlobalObserver`/`UuidObserver`, `NumberHelpers`.
- Spatie QueryBuilder con `filterable()`/`sortable()` sui model, `MediaUploader`/`$fillableMedia`,
  `EnumToArrayTrait` + `OptionController`.
- Obbligo "una Policy per ogni model + `authorizeResource` + Spatie Permission": le Policy si usano
  (vedi sopra), ma senza questo schema.
- Divieto di Observer custom e divieto di `$with`/`$appends` sui model: valgono le best practice Laravel,
  valutando caso per caso.
