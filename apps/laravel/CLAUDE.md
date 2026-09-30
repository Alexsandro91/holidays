@AGENTS.md

# Holidays — backend Laravel

## Ambiente
- Sviluppo con **Sail** (Docker): `artisan`, `composer`, test e Pint vanno eseguiti con `vendor/bin/sail ...`.
- Il DB e' raggiungibile solo dai container (`DB_HOST=mysql`); dal Mac e' su `localhost:3307`.
- Laravel espone **solo API**: il frontend e' l'app React separata in `../react` (Vite).
- Boost: `AGENTS.md` e' generato da `boost:update`, non modificarlo a mano. Le regole di progetto stanno qui.

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
